import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  // Public Customer-Facing Layout & Routes (Open Guest Checkout & Info)
  layout("routes/layout.tsx", [
    index("routes/_index.tsx"),
    route("book", "routes/book.tsx"),
    route("booking/status/:tripId", "routes/booking.status.tsx"),
    route("track/:tripToken?", "routes/track.tsx"),
    route("services", "routes/services.tsx"),
    route("about", "routes/about.tsx"),
    route("contact", "routes/contact.tsx"),
    route("apply", "routes/apply.tsx"),
    route("terms", "routes/terms.tsx"),
    route("privacy", "routes/privacy.tsx"),
  ]),

  // Unified Application Shell & Role-Based Workspaces (PWA Scope: /app)
  route("app", "routes/app.hub.tsx"),
  route("app/login", "routes/app.login.tsx"),
  route("app/register", "routes/app.register.tsx"),
  route("app/passenger", "routes/app.tsx"),
  route("app/driver", "routes/driver.tsx"),
  route("app/dispatch", "routes/dispatch.tsx"),
  route("app/dispatch/popout", "routes/dispatch.popout.tsx"),
  route("app/admin", "routes/admin.tsx"),
  route("app/admin/settings", "routes/admin.settings.tsx"),

  route("construction", "routes/construction.tsx"),
  route("pay/:payToken", "routes/pay.$payToken.tsx"),

  // Backward-Compatible Legacy Redirects -> /app/*
  route("signin", "routes/signin.tsx"),
  route("register", "routes/register.tsx"),
  route("admin/login", "routes/admin.login.tsx"),
  route("driver", "routes/legacy.redirect.tsx", { id: "legacy-driver-redirect" }),
  route("dispatch", "routes/legacy.redirect.tsx", { id: "legacy-dispatch-redirect" }),
  route("dispatch/popout", "routes/legacy.redirect.tsx", { id: "legacy-dispatch-popout-redirect" }),
  route("admin", "routes/legacy.redirect.tsx", { id: "legacy-admin-redirect" }),
  route("admin/settings", "routes/legacy.redirect.tsx", { id: "legacy-admin-settings-redirect" }),

  // Serverless API Routes
  route("api/public-config", "routes/api.public-config.ts"),
  route("api/track", "routes/api.track.ts"),
  route("api/corporate/verify", "routes/api.corporate-verify.ts"),
  route("api/send-email", "routes/api.send-email.ts"),
  route("api/seed-stress-data", "routes/api.seed-stress-data.tsx"),
  route("api/payments", "routes/api.payments.ts"),
  route("api/payments/webhook", "routes/api.payments.webhook.ts"),
  route("api/pay", "routes/api.pay.ts"),
  route("api/push", "routes/api.push.ts"),
  route("api/cron/sla-dispatch", "routes/api.cron.sla-dispatch.ts"),
  route("api/telephony", "routes/api.telephony.ts"),
  route("api/telephony/verify", "routes/api.telephony.verify.ts"),
] satisfies RouteConfig;
