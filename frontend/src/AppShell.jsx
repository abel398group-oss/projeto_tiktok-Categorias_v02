import { NavLink, Outlet, useLocation } from "react-router-dom";

/**
 * Envolve Categorias (início), Analytics, «Produtos em análise» e rotas de produto.
 */
export default function AppShell() {
  const { pathname } = useLocation();

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
            to="/analytics"
            className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}
          >
            Analytics
          </NavLink>
          <NavLink to="/a-mao" className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}>
            Produtos em análise
          </NavLink>
          <NavLink
            to="/shortlist"
            className={({ isActive }) => `tk-nav-link${isActive ? " tk-nav-link--active" : ""}`}
          >
            Minha shortlist
          </NavLink>
        </div>
        <span className="tk-app-nav__trail">Painel · dados importados</span>
      </nav>
      <Outlet />
    </div>
  );
}
