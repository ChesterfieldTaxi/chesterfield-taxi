# Constitution: Chesterfield Taxi Web Booking Portal

## 1. Tech Stack
- **Framework:** React Router v7 (Framework Mode) via Vite
- **Styling:** Tailwind CSS v4
- **Hosting:** Vercel (Public Web Hosting)
- **Database/Auth:** Firebase (Firestore / Firebase Auth) (for Phase 2 console integration)
- **Email/Notifications:** Resend

## 2. Architectural Constraints
- **Config-Driven UI:** UI generation and multi-step form rendering must heavily rely on configuration objects (e.g., forms, steps, validation schemas, and pricing configurations) rather than hardcoded JSX. This ensures maximum maintainability and flexibility for future updates.
- **Strict Abstraction:** Domain logic must not leak into UI components. UI components strictly consume services and configurations.
- **No Executable Code Yet:** This document, alongside the accompanying SDD documents, explicitly outlines the project constraints. Implementation code will follow strictly after specification approval.
