import { type ReactNode, useEffect, useRef, useState } from "react";
import Tile from "./components/Tile";
import TileRow from "./components/TileRow";
import { loadAtlasMap, type AtlasMap, type TileCode } from "./lib/tileAtlas";

type PracticeProblem = {
  id: string;
  category: string;
  title: string;
  roundLabel: string;
  seatWind: "east" | "south" | "west" | "north";
  turn: number;
  dora: TileCode[];
  handTiles: TileCode[];
  answerDiscard: TileCode;
  shanten: number;
  tileEfficiency: Partial<Record<TileCode, number>>;
  reasoning: string;
};

type ApiProblem = {
  id: string;
  category?: string;
  category_id?: string;
  category_title?: string;
  title: string;
  round_label: string;
  seat_wind: "east" | "south" | "west" | "north";
  turn: number;
  dora: TileCode[];
  hand_tiles: TileCode[];
  answer_discard: TileCode;
  shanten: number;
  tile_efficiency: Partial<Record<TileCode, number>>;
  reasoning: string;
};

type CategoryItem = {
  id: string;
  title: string;
};

type TitleItem = {
  id: string;
  title: string;
  round_label: string;
  seat_wind: "east" | "south" | "west" | "north";
  turn: number;
  file: string;
};

const TILE_CODE_REGEX =
  /^(?:[0-9][mps]|east|south|west|north|white|green|red|back)$/;

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
function basePath(path: string): string {
  return BASE + path.replace(/^\//, "");
}

function isTileCode(value: string): value is TileCode {
  return TILE_CODE_REGEX.test(value);
}

function seatWindLabel(wind: PracticeProblem["seatWind"]): string {
  const map: Record<PracticeProblem["seatWind"], string> = {
    east: "东",
    south: "南",
    west: "西",
    north: "北"
  };
  return map[wind];
}

function mapApiProblem(problem: ApiProblem): PracticeProblem {
  return {
    id: problem.id,
    category: problem.category_title ?? problem.category ?? "未分类",
    title: problem.title,
    roundLabel: problem.round_label,
    seatWind: problem.seat_wind,
    turn: problem.turn,
    dora: problem.dora,
    handTiles: problem.hand_tiles,
    answerDiscard: problem.answer_discard,
    shanten: problem.shanten,
    tileEfficiency: problem.tile_efficiency,
    reasoning: problem.reasoning
  };
}

function renderReasoningWithTiles(text: string, atlas: AtlasMap) {
  const parts = text.split(/(\[[^\]]+\])/g);
  const result: ReactNode[] = [];
  parts.forEach((part, idx) => {
    const match = part.match(/^\[([^\]]+)\]$/);
    if (!match) {
      part.split("\n").forEach((line, lineIdx) => {
        if (lineIdx > 0) result.push(<br key={`br-${idx}-${lineIdx}`} />);
        result.push(
          <span key={`txt-${idx}-${lineIdx}`} className="reason-text">
            {line}
          </span>
        );
      });
      return;
    }

    const maybeCode = match[1].trim();
    if (!isTileCode(maybeCode)) {
      result.push(
        <span key={`txt-${idx}`} className="reason-text">
          {part}
        </span>
      );
      return;
    }

    result.push(
      <span key={`tile-${idx}`} className="reason-inline-tile">
        <Tile code={maybeCode} atlas={atlas} scale={0.35} />
      </span>
    );
  });
  return <>{result}</>;
}

export default function App() {
  const [atlas, setAtlas] = useState<AtlasMap | null>(null);
  const [problem, setProblem] = useState<PracticeProblem | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [titlesByCategory, setTitlesByCategory] = useState<Record<string, TitleItem[]>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"home" | "practice">("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingProblem, setLoadingProblem] = useState(true);
  const [problemError, setProblemError] = useState<string | null>(null);
  const [switchingProblem, setSwitchingProblem] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showOriginalQuestion, setShowOriginalQuestion] = useState(false);
  const activeTitleRef = useRef<HTMLButtonElement | null>(null);

  const fetchProblemByFile = async (file: string) => {
    const res = await fetch(basePath(file));
    if (!res.ok) {
      throw new Error(`题目加载失败: ${res.status}`);
    }
    const row = (await res.json()) as ApiProblem;
    return mapApiProblem(row);
  };

  const loadTitlesByCategory = async (categoryId: string) => {
    const res = await fetch(basePath(`/data/categories/${categoryId}/titles.json`));
    if (!res.ok) {
      throw new Error(`分类题目加载失败: ${res.status}`);
    }
    const list = (await res.json()) as TitleItem[];
    list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    return list;
  };

  const navigateProblem = async (direction: -1 | 1) => {
    setSwitchingProblem(true);
    setProblemError(null);
    try {
      const currentTitles = selectedCategoryId ? titlesByCategory[selectedCategoryId] ?? [] : [];
      if (currentTitles.length === 0) throw new Error("当前分类题库为空");
      const currentIdx = currentTitles.findIndex((t) => t.id === selectedProblemId);
      const baseIdx = currentIdx >= 0 ? currentIdx : 0;
      const nextIdx = (baseIdx + direction + currentTitles.length) % currentTitles.length;
      const next = currentTitles[nextIdx];
      const nextProblem = await fetchProblemByFile(next.file);
      setProblem(nextProblem);
      setSelectedProblemId(next.id);
      setView("practice");
      setShowAnalysis(false);
      setShowOriginalQuestion(false);
    } catch (err) {
      setProblemError(err instanceof Error ? err.message : "题目加载失败");
    } finally {
      setSwitchingProblem(false);
    }
  };

  const ensureCategoryTitlesLoaded = async (categoryId: string) => {
    if (titlesByCategory[categoryId]) return titlesByCategory[categoryId];
    const list = await loadTitlesByCategory(categoryId);
    setTitlesByCategory((prev) => ({ ...prev, [categoryId]: list }));
    return list;
  };

  const toggleCategory = async (categoryId: string) => {
    const nextExpanded = !expandedCategories[categoryId];
    setExpandedCategories((prev) => ({ ...prev, [categoryId]: nextExpanded }));
    if (!nextExpanded) return;
    setSelectedCategoryId(categoryId);
    try {
      await ensureCategoryTitlesLoaded(categoryId);
    } catch (err) {
      setProblemError(err instanceof Error ? err.message : "分类加载失败");
    }
  };

  const selectTitle = async (categoryId: string, item: TitleItem) => {
    setLoadingProblem(true);
    setProblemError(null);
    try {
      const row = await fetchProblemByFile(item.file);
      setSelectedCategoryId(categoryId);
      setProblem(row);
      setSelectedProblemId(item.id);
      setView("practice");
      setShowAnalysis(false);
      setShowOriginalQuestion(false);
    } catch (err) {
      setProblemError(err instanceof Error ? err.message : "题目加载失败");
    } finally {
      setLoadingProblem(false);
    }
  };

  const startPractice = async () => {
    const categoryId = selectedCategoryId ?? categories[0]?.id;
    if (!categoryId) return;
    setExpandedCategories((prev) => ({ ...prev, [categoryId]: true }));
    const list = await ensureCategoryTitlesLoaded(categoryId);
    const first = list[0];
    if (!first) return;
    await selectTitle(categoryId, first);
  };

  useEffect(() => {
    if (view !== "practice" || !selectedProblemId) return;
    activeTitleRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [view, selectedProblemId, selectedCategoryId]);

  useEffect(() => {
    loadAtlasMap().then(setAtlas).catch(console.error);
    fetch(basePath("/data/categories.json"))
      .then(async (res) => {
        if (!res.ok) throw new Error(`分类加载失败: ${res.status}`);
        const list = (await res.json()) as CategoryItem[];
        setCategories(list);
        if (list.length > 0) {
          setExpandedCategories({ [list[0].id]: true });
          setSelectedCategoryId(list[0].id);
          const firstTitles = await loadTitlesByCategory(list[0].id);
          setTitlesByCategory((prev) => ({ ...prev, [list[0].id]: firstTitles }));
        }
      })
      .catch((err) => {
        setProblemError(err instanceof Error ? err.message : "题目加载失败");
      })
      .finally(() => {
        setLoadingProblem(false);
      });
  }, []);

  if (!atlas) {
    return <div className="page">正在加载资源...</div>;
  }
  if (problemError) {
    return <div className="page">加载题目失败：{problemError}</div>;
  }

  return (
    <div className="page">
      <div className="page-banner">
        <div className="page-banner-left">
          <div className="page-banner-title">日麻切牌练习</div>
          <div className="page-banner-subtitle">专注牌效率与思路解释的在线切牌训练平台</div>
        </div>
        <div className="page-banner-right">
          <input
            className="banner-search-input"
            placeholder="搜索标题..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="app-layout">
        <aside className="sidebar">
          <button
            className={`home-link ${view === "home" ? "active" : ""}`}
            onClick={() => {
              setView("home");
              setShowAnalysis(false);
            }}
          >
            首页
          </button>
          <div className="menu-list">
            {categories.map((c) => {
              const expanded = !!expandedCategories[c.id];
              const allTitles = titlesByCategory[c.id] ?? [];
              const q = searchQuery.trim().toLowerCase();
              const titles = q
                ? allTitles.filter((t) => t.title.toLowerCase().includes(q))
                : allTitles;
              return (
                <div key={c.id} className="menu-category">
                  <button className="menu-category-btn" onClick={() => toggleCategory(c.id)}>
                    <span>{expanded ? "▾" : "▸"}</span>
                    <span>{c.title}</span>
                  </button>
                  {expanded && (
                    <div className="menu-titles">
                      {titles.map((t) => {
                        const isActive = view === "practice" && selectedProblemId === t.id;
                        return (
                          <button
                            key={t.id}
                            ref={isActive ? (el) => { activeTitleRef.current = el; } : undefined}
                            className={`menu-title-btn ${isActive ? "active" : ""}`}
                            onClick={() => selectTitle(c.id, t)}
                          >
                            {t.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <main className="content">

          {view === "home" && (
            <>
              <section className="home-hero home-card">
                <h1 className="home-hero-title">日麻切牌练习</h1>
                <p className="home-hero-subtitle">
                  面向实战的日麻何切训练工具，提供分类题库、逐题解析与牌效信息，帮助你稳定提升中盘判断质量。
                </p>
                <p className="home-hero-repo">
                  开源项目：
                  {" "}
                  <a href="https://github.com/mj3622/nani-kiru" target="_blank" rel="noopener noreferrer">GitHub · mj3622/nani-kiru</a>
                </p>
                <div className="home-hero-actions">
                  <button className="btn" onClick={() => startPractice()}>
                    开始练习
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const first = categories[0]?.id;
                      if (!first) return;
                      setExpandedCategories((prev) => ({ ...prev, [first]: true }));
                    }}
                  >
                    浏览题库目录
                  </button>
                </div>
              </section>

              <section className="home-preview home-card">
                <h2 className="home-preview-title">界面示意</h2>
                <p className="home-preview-desc">
                  左侧按分类选题，右侧显示局况、手牌与宝牌；作答后可点击「查看解析」查看推荐切牌、向听数与牌效说明，并支持「查看原题」对照书中图示，以及上一题/下一题连续练习。
                </p>
                <div className="home-preview-figure">
                  <img
                    src={basePath("/assets/image.webp")}
                    alt="日麻切牌练习界面示意图"
                    width={1200}
                    height={750}
                    decoding="async"
                    loading="lazy"
                  />
                </div>
              </section>

              <section className="home-panel">
                <h3>数据与版权说明</h3>
                <ul className="home-disclaimers">
                  <li>
                    <strong>题目来源</strong>：思路与内容源自《麻雀 傑作「何切る」300選》（G・ウザク）。请支持原版：
                    {" "}
                    <a href="https://www.amazon.co.jp/%E9%BA%BB%E9%9B%80-%E5%82%91%E4%BD%9C%E3%80%8C%E4%BD%95%E5%88%87%E3%82%8B%E3%80%8D300%E9%81%B8-G%E3%83%BB%E3%82%A6%E3%82%B6%E3%82%AF/dp/4861998948" target="_blank" rel="noopener noreferrer">日亚链接</a>
                  </li>
                  <li>
                    <strong>牌面来源</strong>：
                    <a href="https://mahjongsoul.club/inventory/%E7%89%8C%E9%9D%A2-%E9%BB%98%E8%AA%8D?language=zh-hant" target="_blank" rel="noopener noreferrer">雀魂 DB - 牌面·默認</a>，版权归原权利方所有。
                  </li>
                  <li>
                    <strong>翻译说明</strong>：解析等日文内容的中文翻译由 AI 辅助完成，若有错误欢迎指出或参与修改。
                  </li>
                  <li>
                    <strong>免责</strong>：仅供学习与个人练习使用；题目与解析仅供参考，不构成教学或实战建议。
                  </li>
                </ul>
              </section>
            </>
          )}

          {view === "practice" && !problem && <div className="home-card">正在加载题目...</div>}

          {view === "practice" && problem && (
            <div className="sheet">
            <div className="sheet-title">
              <span className="title-category">{problem.category}</span>
              <span className="title-sep">&gt;</span>
              <span className="title-name">{problem.title}</span>
            </div>

            <div className="sheet-top">
              <div className="round-strip">
                <span className="round-bracket">{"["}</span>
                <span>{problem.roundLabel}</span>
                <span>{seatWindLabel(problem.seatWind)}家</span>
                <span>{problem.turn}巡目</span>
                <span className="round-bracket">{"]"}</span>
              </div>
              <div className="dora-inline">
                <div className="dora-wall">
                  <Tile code="back" atlas={atlas} scale={0.28} />
                  <Tile code="back" atlas={atlas} scale={0.28} />
                </div>
                <div className="dora-center">
                  <Tile code={problem.dora[0] ?? "back"} atlas={atlas} scale={0.28} />
                </div>
                <div className="dora-wall">
                  <Tile code="back" atlas={atlas} scale={0.28} />
                  <Tile code="back" atlas={atlas} scale={0.28} />
                  <Tile code="back" atlas={atlas} scale={0.28} />
                  <Tile code="back" atlas={atlas} scale={0.28} />
                </div>
              </div>
            </div>

            <div className="hand-line">
              <TileRow tiles={problem.handTiles} atlas={atlas} scale={0.62} compact />
            </div>

            <div className="actions">
              <button
                className="btn btn-secondary"
                onClick={() => navigateProblem(-1)}
                disabled={switchingProblem || loadingProblem || !selectedCategoryId}
              >
                上一题
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowAnalysis((v) => !v);
                  if (showAnalysis) setShowOriginalQuestion(false);
                }}
              >
                {showAnalysis ? "隐藏解析" : "查看解析"}
              </button>
              {selectedCategoryId === "what-to-discard-300" && showAnalysis && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowOriginalQuestion((v) => !v)}
                >
                  {showOriginalQuestion ? "隐藏原题" : "查看原题"}
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => navigateProblem(1)}
                disabled={switchingProblem || loadingProblem || !selectedCategoryId}
              >
                {switchingProblem ? "加载中..." : "下一题"}
              </button>
            </div>

            {showAnalysis && (
              <div className="analysis">
                <div className="analysis-summary-row">
                  <div className="discard-target">
                    <span className="discard-arrow">▶</span>
                    <Tile code={problem.answerDiscard} atlas={atlas} scale={0.5} />
                  </div>
                  <div className="analysis-right">
                    <span className="shanten-pill">{problem.shanten}向听</span>
                    <div className="eff-list">
                      {Object.entries(problem.tileEfficiency).map(([code, value]) => {
                        if (!isTileCode(code)) return null;
                        return (
                          <div key={code} className="eff-item">
                            <Tile code={code} atlas={atlas} scale={0.45} />
                            <span className="eff-value">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="analysis-reason-row">
                  <div className="reasoning">{renderReasoningWithTiles(problem.reasoning, atlas)}</div>
                </div>
                {selectedCategoryId === "what-to-discard-300" && showOriginalQuestion && (
                  <div className="analysis-original">
                    <div className="analysis-original-label">原题（书中图示）</div>
                    <div className="analysis-original-figure">
                      <img
                        src={basePath(`/data/categories/what-to-discard-300/questions/${problem.title}.webp`)}
                        alt={`原题 ${problem.title}`}
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          const fallback = (e.target as HTMLImageElement).nextElementSibling;
                          if (fallback) (fallback as HTMLElement).style.display = "block";
                        }}
                      />
                      <span className="analysis-original-fallback" style={{ display: "none" }}>
                        暂无原题图
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
