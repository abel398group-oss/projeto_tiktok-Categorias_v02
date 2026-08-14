import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { CHOSEN_PRODUCTS_CHANGED_EVENT, getChosenProducts } from "./productChosenStorage.js";
import { SHOW_LEGACY_NAV } from "./featureFlags.js";

/**
 * Envolve Categorias (início), Analytics, «Produtos em análise» e rotas de produto.
 */
export default function AppShell() {
  const { pathname } = useLocation();
  const [chosenCount, setChosenCount] = useState(() => getChosenProducts().length);

  useEffect(() => {
    const refresh = () => setChosenCount(getChosenProducts().length);
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(CHOSEN_PRODUCTS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(CHOSEN_PRODUCTS_CHANGED_EVENT, refresh);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--tk-bg-page)",
        color: "var(--tk-text)"
      }}
    >
      <nav className="tk-app-nav" aria-label="Navegação principal">
        <div className="tk-app-nav__brand">
          <strong>TikTok Shop</strong>
          <span>Análises e relatórios</span>
        </div>
        <div className="tk-app-nav__links">
          <NavLink
            to="/"
            end
            className={() =>
              `tk-nav-link${
                pathname === "/" || pathname.startsWith("/categoria/") ? " tk-nav-link--active" : ""
              }`
            }
          >
            Categorias
          </NavLink>
          <NavLink
            to="/ranking"
            className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}
          >
            Ranking
          </NavLink>
          <NavLink
            to="/buscar"
            className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}
          >
            Buscar
          </NavLink>
          <NavLink
            to="/estatisticas"
            className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}
          >
            Estatísticas
          </NavLink>
          <NavLink
            to="/lojas"
            className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}
          >
            Lojas
          </NavLink>
          <NavLink
            to="/parametros"
            className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}
          >
            Parâmetros
          </NavLink>
          {SHOW_LEGACY_NAV ? (
            <>
              <NavLink
                to="/analytics"
                className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}
              >
                Analytics
              </NavLink>
              <NavLink to="/a-mao" className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}>
                Produtos em análise{chosenCount > 0 ? ` (${chosenCount})` : ""}
              </NavLink>
              <NavLink
                to="/shortlist"
                className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}
              >
                Minha shortlist
              </NavLink>
            </>
          ) : null}
        </div>
        <span className="tk-app-nav__trail">Painel · dados importados</span>
      </nav>
      <Outlet />
    </div>
  );
}
