import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';

import Home from './pages/Home';
import Services from './pages/Services';
import ReservationsV2 from './pages/ReservationsV2';
import { PricingTest } from './pages/PricingTest';
import ReservationsV3 from './pages/ReservationsV3';
import Fleet from './pages/Fleet';
import About from './pages/About';
import Careers from './pages/Careers';
import Contact from './pages/Contact';
import Legal from './pages/Legal';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { BookingConfirmation } from './pages/BookingConfirmation';
import { HelpFAB } from './shared/components/HelpFAB';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="services" element={<Services />} />
          <Route path="reservations" element={<ReservationsV3 />} />
          <Route path="v2" element={<ReservationsV2 />} />
          <Route path="v3" element={<ReservationsV3 />} />
          <Route path="pricing-test" element={<PricingTest />} />
          <Route path="fleet" element={<Fleet />} />
          <Route path="about" element={<About />} />
          <Route path="careers" element={<Careers />} />
          <Route path="contact" element={<Contact />} />
          <Route path="legal" element={<Legal />} />
          <Route path="privacy-policy" element={<PrivacyPolicy />} />
          <Route path="terms-of-service" element={<TermsOfService />} />
          <Route path="confirmation" element={<BookingConfirmation />} />
        </Route>
      </Routes>
      <HelpFAB />
    </BrowserRouter>
  );
}

export default App;
