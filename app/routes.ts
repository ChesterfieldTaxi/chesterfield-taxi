import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Public Customer-Facing Layout & Routes
  layout("routes/layout.tsx", [
    index("routes/_index.tsx"),
    route("book", "routes/book.tsx"),
    route("booking/status/:tripId", "routes/booking.status.tsx"),
    route("track/:tripToken", "routes/track.tsx"),
    route("services", "routes/services.tsx"),
    route("about", "routes/about.tsx"),
    route("contact", "routes/contact.tsx"),
  ]),

  // Dedicated Passenger App Shell (Suppresses public marketing header/footer)
  route("app", "routes/app.tsx"),

  // Mobile-Optimized Driver PWA Console
  route("driver", "routes/driver.tsx"),

  // Authentication Routes
  route("signin", "routes/signin.tsx"),
  route("register", "routes/register.tsx"),

  // Operator & Admin Console (Isolated Layout)
  route("admin/login", "routes/admin.login.tsx"),
  route("admin", "routes/admin.tsx"),
  route("admin/settings", "routes/admin.settings.tsx"),
  route("dispatch", "routes/dispatch.tsx"),

  // Transactional Email Gateway Route (Server Action)
  route("api/send-email", "routes/api.send-email.ts"),
  route("api/seed-stress-data", "routes/api.seed-stress-data.tsx"),
] satisfies RouteConfig;

