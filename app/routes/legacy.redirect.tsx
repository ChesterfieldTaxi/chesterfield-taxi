import { useEffect } from 'react';
import { redirect, useLocation, useNavigate, type LoaderFunctionArgs } from 'react-router';

function computeTargetUrl(pathname: string, search: string): string {
  if (pathname === '/signin' || pathname === '/admin/login') {
    return `/app/login${search}`;
  }
  if (pathname === '/register') {
    return `/app/register${search}`;
  }
  if (pathname === '/driver') {
    return `/app/driver${search}`;
  }
  if (pathname === '/corporate') {
    return `/app/corporate${search}`;
  }
  if (pathname === '/dispatch') {
    return `/app/dispatch${search}`;
  }
  if (pathname === '/dispatch/popout') {
    return `/app/dispatch/popout${search}`;
  }
  if (pathname === '/admin') {
    return `/app/admin${search}`;
  }
  if (pathname === '/admin/settings') {
    return `/app/admin/settings${search}`;
  }
  return `/app${search}`;
}

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(computeTargetUrl(url.pathname, url.search));
}

export default function LegacyRouteRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    navigate(computeTargetUrl(location.pathname, location.search), { replace: true });
  }, [location.pathname, location.search, navigate]);

  return null;
}
