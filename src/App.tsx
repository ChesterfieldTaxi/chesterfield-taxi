import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';

import Home from './pages/Home';
import Services from './pages/Services';
import Reservations from './pages/Reservations';
import Fleet from './pages/Fleet';
import About from './pages/About';
import Careers from './pages/Careers';
import Contact from './pages/Contact';
import Legal from './pages/Legal';

// Placeholder pages
// const Home = () => <div className="container section"><h2>Home Page</h2></div>;
// const Services = () => <div className="container section"><h2>Services Page</h2></div>;
// const Reservations = () => <div className="container section"><h2>Reservations Page</h2></div>;
// const Fleet = () => <div className="container section"><h2>Fleet Page</h2></div>;
// const About = () => <div className="container section"><h2>About Page</h2></div>;
// const Careers = () => <div className="container section"><h2>Careers Page</h2></div>;
// const Contact = () => <div className="container section"><h2>Contact Page</h2></div>;
// const Legal = () => <div className="container section"><h2>Legal Page</h2></div>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="services" element={<Services />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="fleet" element={<Fleet />} />
          <Route path="about" element={<About />} />
          <Route path="careers" element={<Careers />} />
          <Route path="contact" element={<Contact />} />
          <Route path="legal" element={<Legal />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
