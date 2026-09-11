import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Public Customer-Facing Layout & Routes
  layout("routes/layout.tsx", [
    index("routes/_index.tsx"),
    route("book", "routes/book.tsx"),
    route("services", "routes/services.tsx"),
    route("about", "routes/about.tsx"),
    route("contact", "routes/contact.tsx"),
  ]),

  // Operator & Admin Console (Isolated Layout)
  route("admin/login", "routes/admin.login.tsx"),
  route("admin", "routes/admin.tsx"),
  route("admin/settings", "routes/admin.settings.tsx"),

  // Transactional Email Gateway Route (Server Action)
  route("api/send-email", "routes/api.send-email.ts"),
] satisfies RouteConfig;
