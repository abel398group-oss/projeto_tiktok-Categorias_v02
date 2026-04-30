import { NavLink, Outlet } from "react-router-dom";

const navLinkStyle = /** @param {{ isActive: boolean }} p */ ({ isActive }) => ({
  padding: "0.38rem 0.9rem",
  borderRadius: 6,
  textDecoration: "none",
  color: "#e7e9ea",
  border: isActive ? "2px solid #6ec4ff" : "1px solid #38444d",
  background: isActive ? "#22303c" : "#192734",
  fontSize: "0.82rem",
  fontWeight: isActive ? 600 : 500
});

/**
 * Envolve relatórios Analytics e página «À mão» — sempre acessível por cima sem carregar a API.
 */
export default function AppShell() {
  return (
    <div style={{ minHeight: "100%", color: "#e7e9ea", background: "#081018" }}>
      <nav
        style={{
          borderBottom: "1px solid #2a3844",
          background: "#121a22",
          padding: "0.55rem 1.25rem",
          display: "flex",
          gap: "0.45rem",
          alignItems: "center",
          flexWrap: "wrap"
        }}
        aria-label="Navegação principal"
      >
        <NavLink to="/" end style={navLinkStyle}>
          Analytics
        </NavLink>
        <NavLink to="/a-mao" style={navLinkStyle}>
          À mão
        </NavLink>
        <span style={{ flex: "1 1 auto" }} />
        <span style={{ fontSize: "0.68rem", opacity: 0.55 }}>Painel TikTok Shop · relatórios e atalhos</span>
      </nav>
      <Outlet />
    </div>
  );
}
