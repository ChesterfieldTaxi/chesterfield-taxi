import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/global.css';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="header">
      <div className="container header-container">
        <Link to="/" className="logo-container">
          <div className="logo-text">
            <span className="logo-brand">CHESTERFIELD</span>
            <span className="logo-type">TAXI</span>
          </div>
        </Link>

        <button className="mobile-menu-btn" onClick={toggleMenu} aria-label="Toggle menu">
          <span className={`hamburger ${isMenuOpen ? 'open' : ''}`}></span>
        </button>

        <nav className={`nav-menu ${isMenuOpen ? 'open' : ''}`}>
          <Link to="/" className="nav-link" onClick={() => setIsMenuOpen(false)}>Home</Link>
          <Link to="/services" className="nav-link" onClick={() => setIsMenuOpen(false)}>Services</Link>
          <Link to="/fleet" className="nav-link" onClick={() => setIsMenuOpen(false)}>Fleet</Link>
          <Link to="/about" className="nav-link" onClick={() => setIsMenuOpen(false)}>About</Link>
          <Link to="/careers" className="nav-link" onClick={() => setIsMenuOpen(false)}>Careers</Link>
          <Link to="/contact" className="nav-link" onClick={() => setIsMenuOpen(false)}>Contact</Link>
          <Link to="/reservations" className="btn btn-primary nav-cta" onClick={() => setIsMenuOpen(false)}>Book Now</Link>
        </nav>
      </div>
      <style>{`
        .header {
          background-color: var(--color-background); /* White background for letterhead style */
          color: var(--color-text);
          padding: var(--spacing-md) 0;
          position: sticky;
          top: 0;
          z-index: 1000;
          box-shadow: var(--shadow-md);
          border-bottom: 4px solid var(--color-primary); /* Divider line */
        }

        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo-container {
          display: flex;
          align-items: center;
          text-decoration: none;
          gap: 0.5rem;
        }

        .logo-text {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          font-family: var(--font-family-sans);
          font-weight: 700;
          line-height: 1;
        }

        .logo-brand {
          font-size: 1.25rem;
          color: var(--color-primary);
          letter-spacing: 0.5px;
        }

        .logo-type {
          font-size: 1.25rem;
          color: var(--color-text);
          letter-spacing: 0.5px;
        }

        .nav-menu {
          display: flex;
          align-items: center;
          gap: var(--spacing-lg);
        }

        .nav-link {
          color: var(--color-text);
          font-weight: 500;
          transition: color 0.2s;
        }

        .nav-link:hover {
          color: var(--color-primary);
        }

        .mobile-menu-btn {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          padding: var(--spacing-xs);
        }

        .hamburger {
          display: block;
          width: 24px;
          height: 2px;
          background-color: var(--color-text);
          position: relative;
          transition: all 0.3s;
        }

        .hamburger::before,
        .hamburger::after {
          content: '';
          position: absolute;
          width: 24px;
          height: 2px;
          background-color: var(--color-text);
          transition: all 0.3s;
        }

        .hamburger::before { top: -8px; }
        .hamburger::after { top: 8px; }

        @media (max-width: 768px) {
          .mobile-menu-btn {
            display: block;
          }

          .nav-menu {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background-color: var(--color-background);
            flex-direction: column;
            padding: var(--spacing-lg);
            gap: var(--spacing-md);
            transform: translateY(-100%);
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease-in-out;
            z-index: -1;
            border-bottom: 1px solid var(--color-border);
            box-shadow: var(--shadow-md);
          }

          .nav-menu.open {
            transform: translateY(0);
            opacity: 1;
            visibility: visible;
          }
          
          .hamburger.open { background-color: transparent; }
          .hamburger.open::before { transform: rotate(45deg); top: 0; }
          .hamburger.open::after { transform: rotate(-45deg); top: 0; }
        }

        @media print {
          .nav-menu, .mobile-menu-btn {
            display: none !important;
          }
          .header-container {
            justify-content: center;
          }
          .logo-container {
            align-items: center;
            margin-bottom: 1rem;
          }
          .header {
            position: static;
            box-shadow: none;
          }
        }
      `}</style>
    </header>
  );
};

export default Header;
