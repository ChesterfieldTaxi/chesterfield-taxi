import React from 'react';
import { Navigate, redirect } from 'react-router';

export function meta() {
  return [
    { title: 'Admin Booking & Website Settings – Chesterfield Taxi' },
    { name: 'description', content: 'Redirecting to Website, Brand & SEO configuration' },
  ];
}

export function loader() {
  return redirect('/app/admin?tab=website&sub=form', 302);
}

export default function AdminSettingsRoute() {
  return <Navigate to="/app/admin?tab=website&sub=form" replace />;
}
