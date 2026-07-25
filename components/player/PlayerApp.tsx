"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import VideoPlayer, { PlaySource } from "./VideoPlayer";
import AddPlaylistModal from "./AddPlaylistModal";
import ProfileGate from "./ProfileGate";
import AdSlot from "@/components/AdSlot";
import Loading, { SkeletonList, MENSAJES_CANALES, MENSAJES_CINE, MENSAJES_SERIES } from "@/components/Loading";
import {
  StoredPlaylist,
  getLocalPlaylists,
  saveLocalPlaylists,
  getFavorites,
  toggleFavorite,
  getRecents,
  pushRecent,
  RecentItem,
} from "@/lib/storage";
import { parseM3U, M3UChannel } from "@/lib/m3u";
import {
  XtreamCreds,
  XtreamCategory,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeries,
  XtreamSeriesInfo,
  xtreamApi,
  liveStreamUrl,
  vodStreamUrl,
  seriesEpisodeUrl,
  decodeBase64Maybe,
} from "@/lib/xtream";

type Tab = "live" | "vod" | "series" | "favs";

interface NowPlaying {
  source: PlaySource;
  logo?: string;
  playlistId: string;
  kind: "live" | "vod" | "episode" | "m3u";
  streamId?: number;
  favKey?: string;
}

interface XtreamData {
  liveCats: XtreamCategory[];
  liveStreams: XtreamLiveStream[];
  vodCats: XtreamCategory[];
  vodStreams: XtreamVodStream[];
  seriesCats: XtreamCategory[];
  seriesList: XtreamSeries[];
}

const K_LAST_PLAYLIST = "xp.lastPlaylist.v1";

function credsOf(p: StoredPlaylist): XtreamCreds {
  return { base: p.url, username: p.username || "", password: p.password || "" };
}

export default function PlayerApp() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [customer, setCustomer] = useState<{ username: string; brand: string } | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [playlists, setPlaylists] = useState<StoredPlaylist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [profile, setProfile] = useState<{ id: number; name: string } | null>(null);

  const [tab, setTab] = useState<Tab>("live");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [xtreamData, setXtreamData] = useState<Record<string, Partial<XtreamData>>>({});
  const [m3uData, setM3uData] = useState<Record<string, M3UChannel[]>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [catFilter, setCatFilter] = useState<string>("all");

  const [current, setCurrent] = useState<NowPlaying | null>(null);
  const [epg, setEpg] = useState<{ now?: string; next?: string } | null>(null);
  const [favorites, setFavorites] = useState<Record<string, true>>({});
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [seriesDetail, setSeriesDetail] = useState<{ series: XtreamSeries; info: XtreamSeriesInfo; season: string } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const active = playlists.find((p) => p.id === activeId) || null;
  const data = active ? xtreamData[active.id] : undefined;

  /* ---------- Carga inicial: auth, listas locales y en la nube ---------- */

  useEffect(() => {
    setFavorites(getFavorites());
    setRecents(getRecents());
    const locals = getLocalPlaylists();
    setPlaylists(locals);
    const last = localStorage.getItem(K_LAST_PLAYLIST);
    if (last && locals.some((p) => p.id === last)) setActiveId(last);
    else if (locals.length) setActiveId(locals[0].id);

    // Cliente dado de alta por un proveedor: su lista se carga sola
    fetch("/api/customer/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.customer || !d.playlist) return;
        setCustomer({ username: d.customer.username, brand: d.brand || "" });
        // Marca blanca: viste el reproductor con el color del proveedor
        if (d.branding?.cssVars) {
          const style = document.createElement("style");
          style.dataset.branding = "1";
          style.textContent = `:root{${d.branding.cssVars}}`;
          document.head.appendChild(style);
        }
        const managed: StoredPlaylist = {
          id: d.playlist.id,
          name: d.playlist.name,
          type: d.playlist.type,
          url: d.playlist.url,
          username: d.playlist.username,
          password: d.playlist.password,
          managed: true,
        };
        setPlaylists((prev) => [managed, ...prev.filter((p) => p.id !== managed.id)]);
        setActiveId(managed.id);
      })
      .catch(() => {});

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(async (d) => {
        if (d.user) {
          setUser(d.user);
          const res = await fetch("/api/playlists");
          if (res.ok) {
            const body = await res.json();
            const remote: StoredPlaylist[] = (body.playlists || []).map(
              (p: { id: string; name: string; type: "xtream" | "m3u"; url: string; username: string; password: string }) => ({
                id: `cloud-${p.id}`,
                name: p.name,
                type: p.type,
                url: p.url,
                username: p.username,
                password: p.password,
                remote: true,
              })
            );
            setPlaylists((prev) => {
              const merged = [...remote, ...prev.filter((x) => !x.remote)];
              setActiveId((cur) => cur ?? (merged[0]?.id || null));
              return merged;
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setAuthLoaded(true));
  }, []);

  useEffect(() => {
    if (activeId) localStorage.setItem(K_LAST_PLAYLIST, activeId);
  }, [activeId]);

  /* ---------- Carga de datos por lista y pestaña ---------- */

  const loadTab = useCallback(
    async (p: StoredPlaylist, t: Tab) => {
      setLoadError(null);
      setSeriesDetail(null);
      if (p.type === "m3u") {
        if (m3uData[p.id]) return;
        setLoading(true);
        try {
          const res = await fetch(`/api/m3u?url=${encodeURIComponent(p.url)}`);
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || "No se pudo cargar la lista");
          }
          const text = await res.text();
          const parsed = parseM3U(text);
          setM3uData((prev) => ({ ...prev, [p.id]: parsed.channels }));
        } catch (e) {
          setLoadError(e instanceof Error ? e.message : "Error al cargar la lista");
        } finally {
          setLoading(false);
        }
        return;
      }

      const creds = credsOf(p);
      const cache = xtreamData[p.id] || {};
      const need =
        (t === "live" && !cache.liveStreams) ||
        (t === "vod" && !cache.vodStreams) ||
        (t === "series" && !cache.seriesList);
      if (!need) return;

      setLoading(true);
      // Algunos paneles devuelven objetos de error en vez de arrays: nunca confiar en la forma
      const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
      try {
        if (t === "live") {
          const [cats, streams] = await Promise.all([
            xtreamApi<unknown>(creds, "get_live_categories"),
            xtreamApi<unknown>(creds, "get_live_streams"),
          ]);
          setXtreamData((prev) => ({
            ...prev,
            [p.id]: { ...prev[p.id], liveCats: asArray<XtreamCategory>(cats), liveStreams: asArray<XtreamLiveStream>(streams) },
          }));
        } else if (t === "vod") {
          const [cats, streams] = await Promise.all([
            xtreamApi<unknown>(creds, "get_vod_categories"),
            xtreamApi<unknown>(creds, "get_vod_streams"),
          ]);
          setXtreamData((prev) => ({
            ...prev,
            [p.id]: { ...prev[p.id], vodCats: asArray<XtreamCategory>(cats), vodStreams: asArray<XtreamVodStream>(streams) },
          }));
        } else if (t === "series") {
          const [cats, list] = await Promise.all([
            xtreamApi<unknown>(creds, "get_series_categories"),
            xtreamApi<unknown>(creds, "get_series"),
          ]);
          setXtreamData((prev) => ({
            ...prev,
            [p.id]: { ...prev[p.id], seriesCats: asArray<XtreamCategory>(cats), seriesList: asArray<XtreamSeries>(list) },
          }));
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Error al conectar con el servidor");
      } finally {
        setLoading(false);
      }
    },
    [m3uData, xtreamData]
  );

  useEffect(() => {
    if (!active) return;
    setCatFilter("all");
    if (active.type === "m3u" && (tab === "vod" || tab === "series")) {
      setTab("live");
      return;
    }
    const effective = tab === "favs" ? "live" : tab;
    loadTab(active, effective);
  }, [active, tab, loadTab]);

  /* ---------- EPG del canal en reproducción ---------- */

  useEffect(() => {
    setEpg(null);
    if (!current || current.kind !== "live" || !current.streamId) return;
    const p = playlists.find((x) => x.id === current.playlistId);
    if (!p || p.type !== "xtream") return;
    let cancelled = false;
    xtreamApi<{ epg_listings?: { title?: string; start?: string; end?: string }[] }>(
      credsOf(p),
      "get_short_epg",
      { stream_id: String(current.streamId), limit: "2" }
    )
      .then((res) => {
        if (cancelled) return;
        const listings = res.epg_listings || [];
        setEpg({
          now: decodeBase64Maybe(listings[0]?.title),
          next: decodeBase64Maybe(listings[1]?.title),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current, playlists]);

  /* ---------- Acciones ---------- */

  async function handleAddPlaylist(p: StoredPlaylist, saveToCloud: boolean) {
    if (saveToCloud && user) {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: p.name, type: p.type, url: p.url, username: p.username, password: p.password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "No se pudo guardar la lista");
      const saved: StoredPlaylist = { ...p, id: `cloud-${body.playlist.id}`, remote: true };
      setPlaylists((prev) => [...prev, saved]);
      setActiveId(saved.id);
    } else {
      setPlaylists((prev) => {
        const next = [...prev, p];
        saveLocalPlaylists(next);
        return next;
      });
      setActiveId(p.id);
    }
    setShowAdd(false);
    setTab("live");
  }

  async function handleDeletePlaylist(p: StoredPlaylist) {
    if (p.managed) {
      alert("Esta lista la gestiona tu proveedor y no se puede eliminar.");
      return;
    }
    if (!confirm(`¿Eliminar la lista «${p.name}»?`)) return;
    if (p.remote) {
      await fetch(`/api/playlists/${p.id.replace("cloud-", "")}`, { method: "DELETE" }).catch(() => {});
    }
    setPlaylists((prev) => {
      const next = prev.filter((x) => x.id !== p.id);
      saveLocalPlaylists(next);
      if (activeId === p.id) setActiveId(next[0]?.id || null);
      return next;
    });
    if (current?.playlistId === p.id) setCurrent(null);
  }

  const playLive = useCallback(
    (p: StoredPlaylist, ch: XtreamLiveStream) => {
      const favKey = `${p.id}:live:${ch.stream_id}`;
      setCurrent({
        source: { url: liveStreamUrl(credsOf(p), ch.stream_id), name: ch.name, kind: "hls" },
        logo: ch.stream_icon,
        playlistId: p.id,
        kind: "live",
        streamId: ch.stream_id,
        favKey,
      });
      setRecents(
        pushRecent({
          key: favKey,
          name: ch.name,
          logo: ch.stream_icon,
          playlistId: p.id,
          kind: "live",
          payload: { stream_id: ch.stream_id, name: ch.name, stream_icon: ch.stream_icon },
        })
      );
    },
    []
  );

  const playM3u = useCallback((p: StoredPlaylist, ch: M3UChannel) => {
    const favKey = `${p.id}:m3u:${ch.url}`;
    setCurrent({
      source: { url: ch.url, name: ch.name, kind: "auto" },
      logo: ch.logo,
      playlistId: p.id,
      kind: "m3u",
      favKey,
    });
    setRecents(
      pushRecent({
        key: favKey,
        name: ch.name,
        logo: ch.logo,
        playlistId: p.id,
        kind: "m3u",
        payload: { url: ch.url, name: ch.name, logo: ch.logo },
      })
    );
  }, []);

  function playVod(p: StoredPlaylist, item: XtreamVodStream) {
    const ext = item.container_extension || "mp4";
    setCurrent({
      source: { url: vodStreamUrl(credsOf(p), item.stream_id, ext), name: item.name, kind: "video" },
      logo: item.stream_icon,
      playlistId: p.id,
      kind: "vod",
      favKey: `${p.id}:vod:${item.stream_id}`,
    });
    setRecents(
      pushRecent({
        key: `${p.id}:vod:${item.stream_id}`,
        name: item.name,
        logo: item.stream_icon,
        playlistId: p.id,
        kind: "vod",
        payload: { stream_id: item.stream_id, name: item.name, ext },
      })
    );
  }

  async function openSeries(p: StoredPlaylist, s: XtreamSeries) {
    setLoading(true);
    setLoadError(null);
    try {
      const info = await xtreamApi<XtreamSeriesInfo>(credsOf(p), "get_series_info", {
        series_id: String(s.series_id),
      });
      const seasons = Object.keys(info.episodes || {});
      setSeriesDetail({ series: s, info, season: seasons[0] || "" });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar la serie");
    } finally {
      setLoading(false);
    }
  }

  function playEpisode(p: StoredPlaylist, s: XtreamSeries, epId: string, title: string, ext?: string) {
    setCurrent({
      source: { url: seriesEpisodeUrl(credsOf(p), epId, ext || "mp4"), name: `${s.name} — ${title}`, kind: "video" },
      logo: s.cover,
      playlistId: p.id,
      kind: "episode",
    });
  }

  function onToggleFav(key: string) {
    setFavorites(toggleFavorite(key));
  }

  function playRecent(item: RecentItem) {
    const p = playlists.find((x) => x.id === item.playlistId);
    if (!p) return;
    if (item.kind === "live") {
      playLive(p, item.payload as unknown as XtreamLiveStream);
    } else if (item.kind === "m3u") {
      playM3u(p, item.payload as unknown as M3UChannel);
    } else if (item.kind === "vod") {
      const pl = item.payload as { stream_id: number; name: string; ext?: string };
      setCurrent({
        source: { url: vodStreamUrl(credsOf(p), pl.stream_id, pl.ext || "mp4"), name: pl.name, kind: "video" },
        logo: item.logo,
        playlistId: p.id,
        kind: "vod",
      });
    }
  }

  /* ---------- Listas visibles (búsqueda + categorías + favoritos) ---------- */

  const q = search.trim().toLowerCase();

  const liveGroups = useMemo(() => {
    if (!active) return [] as { name: string; channels: { id: string; name: string; logo?: string; favKey: string; play: () => void }[] }[];

    if (active.type === "m3u") {
      const channels = m3uData[active.id] || [];
      const byGroup = new Map<string, M3UChannel[]>();
      for (const ch of channels) {
        if (q && !ch.name.toLowerCase().includes(q)) continue;
        const g = ch.group || "Sin categoría";
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g)!.push(ch);
      }
      const groups = Array.from(byGroup.entries()).map(([name, chs]) => ({
        name,
        channels: chs.map((ch) => ({
          id: ch.id,
          name: ch.name,
          logo: ch.logo,
          favKey: `${active.id}:m3u:${ch.url}`,
          play: () => playM3u(active, ch),
        })),
      }));
      if (tab === "favs") {
        return groups
          .map((g) => ({ ...g, channels: g.channels.filter((c) => favorites[c.favKey]) }))
          .filter((g) => g.channels.length);
      }
      return groups;
    }

    const cache = xtreamData[active.id];
    if (!cache?.liveStreams) return [];
    const catName = new Map((cache.liveCats || []).map((c) => [c.category_id, c.category_name]));
    const byCat = new Map<string, XtreamLiveStream[]>();
    for (const ch of cache.liveStreams) {
      if (q && !ch.name.toLowerCase().includes(q)) continue;
      const g = catName.get(ch.category_id || "") || "Otros";
      if (!byCat.has(g)) byCat.set(g, []);
      byCat.get(g)!.push(ch);
    }
    const groups = Array.from(byCat.entries()).map(([name, chs]) => ({
      name,
      channels: chs.map((ch) => ({
        id: String(ch.stream_id),
        name: ch.name,
        logo: ch.stream_icon,
        favKey: `${active.id}:live:${ch.stream_id}`,
        play: () => playLive(active, ch),
      })),
    }));
    if (tab === "favs") {
      return groups
        .map((g) => ({ ...g, channels: g.channels.filter((c) => favorites[c.favKey]) }))
        .filter((g) => g.channels.length);
    }
    return groups;
  }, [active, m3uData, xtreamData, q, tab, favorites, playLive, playM3u]);

  const flatChannels = useMemo(() => liveGroups.flatMap((g) => g.channels), [liveGroups]);

  const vodVisible = useMemo(() => {
    if (!active || active.type !== "xtream") return [];
    const items = data?.vodStreams || [];
    return items.filter(
      (v) => (catFilter === "all" || v.category_id === catFilter) && (!q || v.name.toLowerCase().includes(q))
    );
  }, [active, data, catFilter, q]);

  const seriesVisible = useMemo(() => {
    if (!active || active.type !== "xtream") return [];
    const items = data?.seriesList || [];
    return items.filter(
      (s) => (catFilter === "all" || s.category_id === catFilter) && (!q || s.name.toLowerCase().includes(q))
    );
  }, [active, data, catFilter, q]);

  /* ---------- Atajos de teclado ---------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) {
        if (e.key === "Escape") (el as HTMLElement).blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "f" || e.key === "F") {
        document.querySelector<HTMLVideoElement>(".pa-video-zone video")?.requestFullscreen?.().catch(() => {});
      } else if (e.key === "m" || e.key === "M") {
        const v = document.querySelector<HTMLVideoElement>(".pa-video-zone video");
        if (v) v.muted = !v.muted;
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && current?.favKey && flatChannels.length) {
        const idx = flatChannels.findIndex((c) => c.favKey === current.favKey);
        if (idx >= 0) {
          e.preventDefault();
          const next = e.key === "ArrowDown" ? (idx + 1) % flatChannels.length : (idx - 1 + flatChannels.length) % flatChannels.length;
          flatChannels[next].play();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, flatChannels]);

  /* ---------- Render ---------- */

  const isXtream = active?.type === "xtream";
  const showSidebar = tab === "live" || tab === "favs" || !isXtream;
  const vodCats = data?.vodCats || [];
  const seriesCats = data?.seriesCats || [];

  return (
    <>
    <ProfileGate onReady={(p) => setProfile({ id: p.id, name: p.name })} />
    <div className="player-app">
      <aside className="pa-sidebar" aria-label="Listas y canales">
        <div className="pa-sidebar-head">
          <div className="pa-playlist-select">
            <select
              className="input"
              value={activeId || ""}
              onChange={(e) => setActiveId(e.target.value || null)}
              aria-label="Seleccionar lista"
            >
              {!playlists.length && <option value="">Sin listas</option>}
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.remote ? "☁ " : ""}{p.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)} title="Añadir lista">
              +
            </button>
            {active && !active.managed && (
              <button className="btn btn-danger btn-sm" onClick={() => handleDeletePlaylist(active)} title="Eliminar lista">
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>

          {active && (
            <div className="pa-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "live"} className={`pa-tab ${tab === "live" ? "active" : ""}`} onClick={() => setTab("live")}>
                {isXtream ? "Directo" : "Canales"}
              </button>
              {isXtream && (
                <>
                  <button role="tab" aria-selected={tab === "vod"} className={`pa-tab ${tab === "vod" ? "active" : ""}`} onClick={() => setTab("vod")}>
                    Cine
                  </button>
                  <button role="tab" aria-selected={tab === "series"} className={`pa-tab ${tab === "series" ? "active" : ""}`} onClick={() => setTab("series")}>
                    Series
                  </button>
                </>
              )}
              <button role="tab" aria-selected={tab === "favs"} className={`pa-tab ${tab === "favs" ? "active" : ""}`} onClick={() => setTab("favs")} title="Favoritos" aria-label="Favoritos">
                <Icon name="check" size={15} />
              </button>
            </div>
          )}

          {active && (
            <div className="pa-search">
              <Icon name="search" size={15} className="pa-search-icon" />
              <input
                ref={searchRef}
                className="input"
                placeholder="Buscar… (pulsa /)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar canales y contenido"
              />
            </div>
          )}
        </div>

        <div className="pa-lists">
          {!active && (
            <div className="pa-empty">
              Añade tu primera lista M3U o Xtream Codes para empezar.
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
                  <><Icon name="plus" size={15} /> Añadir lista</>
                </button>
              </div>
            </div>
          )}

          {active && loading && (tab === "live" || tab === "favs") && (
            <div data-testid="cargando-canales">
              <Loading messages={MENSAJES_CANALES} compact />
              <SkeletonList rows={7} />
            </div>
          )}

          {active && loadError && (tab === "live" || tab === "favs") && (
            <div className="pa-empty">
              <div className="error-box">{loadError}</div>
            </div>
          )}

          {active && showSidebar && !loading && !loadError && (tab === "live" || tab === "favs") && (
            <>
              {!liveGroups.length && (
                <div className="pa-empty">
                  {tab === "favs" ? "Aún no tienes favoritos. Pasa el ratón por un canal y pulsa la estrella." : "No hay canales que coincidan."}
                </div>
              )}
              {liveGroups.map((g) => {
                const open = q ? true : tab === "favs" ? true : openGroups[`${active.id}:${g.name}`] ?? false;
                return (
                  <div className="pa-group" key={g.name}>
                    <button
                      className="pa-group-head"
                      onClick={() => setOpenGroups((prev) => ({ ...prev, [`${active.id}:${g.name}`]: !open }))}
                      aria-expanded={open}
                    >
                      <span>{g.name}</span>
                      <span className="count">{g.channels.length}</span>
                    </button>
                    {open &&
                      g.channels.map((ch) => (
                        <button
                          key={ch.favKey}
                          className={`pa-channel ${current?.favKey === ch.favKey ? "active" : ""}`}
                          onClick={ch.play}
                        >
                          {ch.logo ? (
                            <img src={ch.logo} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                          ) : (
                            <span className="ph"><Icon name="play" size={13} /></span>
                          )}
                          <span className="name">{ch.name}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            className={`fav-btn ${favorites[ch.favKey] ? "on" : ""}`}
                            title="Favorito"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFav(ch.favKey);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.stopPropagation();
                                onToggleFav(ch.favKey);
                              }
                            }}
                          >
                            <Icon name="check" size={13} />
                          </span>
                        </button>
                      ))}
                  </div>
                );
              })}
            </>
          )}

          {active && isXtream && (tab === "vod" || tab === "series") && (
            <div style={{ padding: 8 }}>
              <label className="label" style={{ padding: "0 4px" }}>Categorías</label>
              <button
                className={`pa-channel ${catFilter === "all" ? "active" : ""}`}
                onClick={() => setCatFilter("all")}
              >
                <span className="name">Todas</span>
              </button>
              {(tab === "vod" ? vodCats : seriesCats).map((c) => (
                <button
                  key={c.category_id}
                  className={`pa-channel ${catFilter === c.category_id ? "active" : ""}`}
                  onClick={() => setCatFilter(c.category_id)}
                >
                  <span className="name">{c.category_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {customer ? (
          <div style={{ padding: 12, borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--text-dim)" }}>
            {profile ? (
              <>
                Perfil <strong>{profile.name}</strong> · {customer.username}
              </>
            ) : (
              <>
                Conectado como <strong>{customer.username}</strong>
                {customer.brand ? ` · ${customer.brand}` : ""}
              </>
            )}
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 8 }}
              onClick={async () => {
                await fetch("/api/customer/me", { method: "DELETE" });
                window.location.href = "/acceso";
              }}
            >
              Salir
            </button>
          </div>
        ) : authLoaded && !user ? (
          <div style={{ padding: 12, borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--text-dim)" }}>
            Modo invitado — <Link href="/registro">crea una cuenta</Link> para sincronizar tus listas.
          </div>
        ) : null}
      </aside>

      <main className="pa-main">
        <VideoPlayer source={current?.source || null} />

        {current && (
          <div className="pa-now-playing">
            {current.logo && <img src={current.logo} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pa-now-title">{current.source.name}</div>
              {epg?.now && (
                <div className="pa-now-epg">
                  Ahora: {epg.now}
                  {epg.next ? <span className="epg-next"> · Después: {epg.next}</span> : null}
                </div>
              )}
            </div>
            {current.favKey && (
              <button
                className={`btn btn-ghost btn-sm`}
                onClick={() => onToggleFav(current.favKey!)}
                title="Añadir a favoritos"
              >
                <><Icon name="check" size={14} /> {favorites[current.favKey] ? "En favoritos" : "Añadir a favoritos"}</>
              </button>
            )}
          </div>
        )}

        <div className="pa-content">
          {!active && (
            <div className="pa-welcome">
              <h2>Bienvenido a TOTALplayer</h2>
              <p>
                Añade tu lista M3U o tus credenciales Xtream Codes y empieza a ver TV en directo, películas y series
                directamente en el navegador.
              </p>
              <button className="btn btn-primary btn-lg" onClick={() => setShowAdd(true)}>
                <><Icon name="plus" size={17} /> Añadir mi primera lista</>
              </button>
              {recents.length > 0 && (
                <>
                  <h3 style={{ marginTop: 20, fontSize: 15, color: "var(--text-dim)" }}>Visto recientemente</h3>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    {recents.slice(0, 6).map((r) => (
                      <button key={r.key} className="btn btn-ghost btn-sm" onClick={() => playRecent(r)}>
                        <><Icon name="play" size={13} /> {r.name}</>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="pa-shortcuts">
                <span><span className="kbd">↑↓</span> Zapping</span>
                <span><span className="kbd">/</span> Buscar</span>
                <span><span className="kbd">F</span> Pantalla completa</span>
                <span><span className="kbd">M</span> Silenciar</span>
              </div>
            </div>
          )}

          {active && (tab === "live" || tab === "favs") && !current && (
            <div className="pa-welcome">
              <h2>{tab === "favs" ? "Tus favoritos" : "Elige un canal"}</h2>
              <p>Selecciona un canal de la izquierda o usa la búsqueda. Zapea con las flechas del teclado.</p>
              {recents.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {recents.slice(0, 6).map((r) => (
                    <button key={r.key} className="btn btn-ghost btn-sm" onClick={() => playRecent(r)}>
                      <><Icon name="play" size={13} /> {r.name}</>
                    </button>
                  ))}
                </div>
              )}
              <AdSlot slot="player-welcome" />
            </div>
          )}

          {active && isXtream && tab === "vod" && !seriesDetail && (
            <>
              {loading && <Loading messages={MENSAJES_CINE} />}
              {loadError && <div className="pa-empty"><div className="error-box">{loadError}</div></div>}
              <div className="pa-grid">
                {vodVisible.slice(0, 400).map((v) => (
                  <button className="pa-card" key={v.stream_id} onClick={() => playVod(active, v)} title={v.name}>
                    {v.stream_icon ? (
                      <img className="poster" src={v.stream_icon} alt={v.name} loading="lazy" onError={(e) => ((e.target as HTMLImageElement).outerHTML = '<div class="poster-ph">·</div>')} />
                    ) : (
                      <div className="poster-ph"><Icon name="play" size={26} /></div>
                    )}
                    <div className="meta">
                      <div className="title">{v.name}</div>
                    </div>
                  </button>
                ))}
              </div>
              {vodVisible.length > 400 && (
                <p style={{ textAlign: "center", color: "var(--text-faint)", padding: "0 0 20px" }}>
                  Mostrando 400 de {vodVisible.length} — usa la búsqueda para afinar.
                </p>
              )}
            </>
          )}

          {active && isXtream && tab === "series" && !seriesDetail && (
            <>
              {loading && <Loading messages={MENSAJES_SERIES} />}
              {loadError && <div className="pa-empty"><div className="error-box">{loadError}</div></div>}
              <div className="pa-grid">
                {seriesVisible.slice(0, 400).map((s) => (
                  <button className="pa-card" key={s.series_id} onClick={() => openSeries(active, s)} title={s.name}>
                    {s.cover ? (
                      <img className="poster" src={s.cover} alt={s.name} loading="lazy" onError={(e) => ((e.target as HTMLImageElement).outerHTML = '<div class="poster-ph">·</div>')} />
                    ) : (
                      <div className="poster-ph"><Icon name="tv" size={26} /></div>
                    )}
                    <div className="meta">
                      <div className="title">{s.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {active && isXtream && seriesDetail && (
            <div className="pa-series-detail">
              <button className="btn btn-ghost btn-sm" onClick={() => setSeriesDetail(null)} style={{ marginBottom: 16 }}>
                ← Volver a series
              </button>
              <div className="pa-series-head">
                {seriesDetail.series.cover && <img src={seriesDetail.series.cover} alt={seriesDetail.series.name} />}
                <div>
                  <h2>{seriesDetail.series.name}</h2>
                  <p>{seriesDetail.info.info?.plot || seriesDetail.series.plot || ""}</p>
                </div>
              </div>
              <div className="pa-season-tabs">
                {Object.keys(seriesDetail.info.episodes || {}).map((season) => (
                  <button
                    key={season}
                    className={`btn btn-sm ${seriesDetail.season === season ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setSeriesDetail({ ...seriesDetail, season })}
                  >
                    Temporada {season}
                  </button>
                ))}
              </div>
              {(seriesDetail.info.episodes?.[seriesDetail.season] || []).map((ep) => (
                <button
                  key={ep.id}
                  className="pa-episode"
                  onClick={() =>
                    playEpisode(active, seriesDetail.series, ep.id, ep.title || `Episodio ${ep.episode_num}`, ep.container_extension)
                  }
                >
                  <span className="ep-num">{ep.episode_num}.</span>
                  <span>{ep.title || `Episodio ${ep.episode_num}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {showAdd && <AddPlaylistModal loggedIn={!!user} onAdd={handleAddPlaylist} onClose={() => setShowAdd(false)} />}
    </div>
    </>
  );
}
