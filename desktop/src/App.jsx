import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  AppShellRoutes,
  DEFAULT_APP_ROUTE,
  routeFromHash,
} from "./app/routes/index.js";

const surfaceContent = {
  projects: {
    eyebrow: "Projects",
    title: "Repository and delivery hub",
    description:
      "GitHub-like project work lands here first. Feature slices can add richer boards and commit views without changing the shell contract.",
  },
  tasks: {
    eyebrow: "Tasks",
    title: "Execution board",
    description:
      "Task views can evolve independently while still reading the same workspace snapshot and writing through the repository adapter.",
  },
  ideas: {
    eyebrow: "Ideas",
    title: "Incubation space",
    description:
      "Idea capture, review, and promotion stay feature-local, but the shell freezes the route and shared references up front.",
  },
  files: {
    eyebrow: "Files",
    title: "Local file organizer",
    description:
      "Drive-like file management can expand later while keeping file entities and cross-links in the shared workspace snapshot.",
  },
};

const shellStyles = {
  app: {
    minHeight: "100vh",
    margin: 0,
    padding: "24px",
    background:
      "linear-gradient(180deg, rgb(244, 242, 236) 0%, rgb(229, 234, 238) 100%)",
    color: "#102033",
    fontFamily: '"Segoe UI", sans-serif',
  },
  frame: {
    maxWidth: "1120px",
    margin: "0 auto",
    padding: "24px",
    borderRadius: "24px",
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    boxShadow: "0 16px 48px rgba(16, 32, 51, 0.12)",
    backdropFilter: "blur(10px)",
  },
  header: {
    display: "grid",
    gap: "12px",
    marginBottom: "24px",
  },
  eyebrow: {
    margin: 0,
    fontSize: "12px",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "#5d6b79",
  },
  title: {
    margin: 0,
    fontSize: "34px",
    lineHeight: 1.1,
  },
  subtitle: {
    margin: 0,
    maxWidth: "720px",
    color: "#44515d",
  },
  nav: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    marginBottom: "24px",
  },
  navLink: {
    display: "grid",
    gap: "6px",
    padding: "16px",
    borderRadius: "18px",
    border: "1px solid rgba(93, 107, 121, 0.16)",
    backgroundColor: "#f8fafb",
    color: "inherit",
    textDecoration: "none",
  },
  navLinkActive: {
    backgroundColor: "#102033",
    color: "#f8fafb",
    borderColor: "#102033",
  },
  label: {
    fontSize: "17px",
    fontWeight: 600,
  },
  caption: {
    fontSize: "13px",
    color: "inherit",
    opacity: 0.8,
  },
  panel: {
    display: "grid",
    gap: "20px",
    gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)",
  },
  heroCard: {
    padding: "24px",
    borderRadius: "20px",
    backgroundColor: "#ffffff",
    border: "1px solid rgba(93, 107, 121, 0.14)",
    boxShadow: "0 12px 24px rgba(16, 32, 51, 0.06)",
  },
  statsCard: {
    padding: "24px",
    borderRadius: "20px",
    backgroundColor: "#f4f6f8",
    border: "1px solid rgba(93, 107, 121, 0.14)",
  },
  list: {
    display: "grid",
    gap: "12px",
    padding: 0,
    margin: 0,
    listStyle: "none",
  },
  item: {
    padding: "14px 16px",
    borderRadius: "16px",
    backgroundColor: "#eef2f4",
  },
  statNumber: {
    margin: "6px 0 0",
    fontSize: "42px",
    fontWeight: 700,
  },
};

function useWorkspaceSnapshot(repository) {
  return useSyncExternalStore(
    (listener) => repository.subscribe(listener),
    () => repository.readSnapshot(),
    () => repository.readSnapshot(),
  );
}

function readCurrentRoute() {
  if (typeof window === "undefined") {
    return DEFAULT_APP_ROUTE;
  }

  return routeFromHash(window.location.hash);
}

function routeCollection(snapshot) {
  return {
    projects: snapshot.projects,
    tasks: snapshot.tasks,
    ideas: snapshot.ideas,
    files: snapshot.files,
  };
}

export default function App({ repository }) {
  const snapshot = useWorkspaceSnapshot(repository);
  const [activeRoute, setActiveRoute] = useState(readCurrentRoute);
  const collections = routeCollection(snapshot);
  const activeSurface = surfaceContent[activeRoute];
  const activeRecords = collections[activeRoute] ?? [];

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleHashChange = () => {
      setActiveRoute(readCurrentRoute());
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    repository.writeSnapshot((currentSnapshot) => ({
      ...currentSnapshot,
      navigation: {
        ...currentSnapshot.navigation,
        lastRoute: activeRoute,
      },
    }));
  }, [activeRoute, repository]);

  return (
    <main style={shellStyles.app}>
      <div style={shellStyles.frame}>
        <header style={shellStyles.header}>
          <p style={shellStyles.eyebrow}>Jakal Workspace</p>
          <h1 style={shellStyles.title}>Local-first desktop shell</h1>
          <p style={shellStyles.subtitle}>
            The app shell is frozen around four top-level routes and one shared
            repository boundary so downstream feature slices can build in
            parallel without redefining core workspace data.
          </p>
        </header>

        <nav aria-label="Workspace areas" style={shellStyles.nav}>
          {AppShellRoutes.map((route) => {
            const isActive = route.key === activeRoute;
            const count = collections[route.key]?.length ?? 0;

            return (
              <a
                key={route.key}
                href={route.path}
                style={{
                  ...shellStyles.navLink,
                  ...(isActive ? shellStyles.navLinkActive : null),
                }}
              >
                <span style={shellStyles.label}>{route.label}</span>
                <span style={shellStyles.caption}>
                  {route.description}
                  {" • "}
                  {count} items
                </span>
              </a>
            );
          })}
        </nav>

        <section style={shellStyles.panel}>
          <article style={shellStyles.heroCard}>
            <p style={shellStyles.eyebrow}>{activeSurface.eyebrow}</p>
            <h2 style={{ marginTop: 0 }}>{activeSurface.title}</h2>
            <p>{activeSurface.description}</p>
            <ul style={shellStyles.list}>
              {activeRecords.map((record) => (
                <li key={record.id} style={shellStyles.item}>
                  <strong>{record.title}</strong>
                  <div>{record.summary}</div>
                </li>
              ))}
            </ul>
          </article>

          <aside style={shellStyles.statsCard}>
            <p style={shellStyles.eyebrow}>Repository boundary</p>
            <h2 style={{ marginTop: 0 }}>WorkspaceRepository</h2>
            <p>
              UI routes read the same snapshot and write through the same
              repository instance.
            </p>
            <p style={shellStyles.statNumber}>{activeRecords.length}</p>
            <p style={{ marginTop: 0 }}>
              Seed records on the active route. Current shell key:{" "}
              <strong>{activeRoute}</strong>
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}
