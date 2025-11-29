import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backgroundImage?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  backgroundImage
}) => {
  return (
    <>
      <header className="page-header">
        <div className="container">
          <h1>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </header>

      <style>{`
        .page-header {
          background-color: #1a1a1a;
          color: white;
          padding: 4rem 0;
          text-align: center;
          ${backgroundImage ? `
          background-image: linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url('${backgroundImage}');
          background-size: cover;
          background-position: center;
          ` : 'background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);'}
        }

        .page-header h1 {
          color: white;
          font-size: 3rem;
          margin-bottom: 0.5rem;
          font-weight: 700;
        }

        .page-subtitle {
          font-size: 1.2rem;
          opacity: 0.95;
          max-width: 600px;
          margin: 0 auto;
        }

        @media (max-width: 768px) {
          .page-header {
            padding: 3rem 0;
          }

          .page-header h1 {
            font-size: 2rem;
          }

          .page-subtitle {
            font-size: 1rem;
          }
        }
      `}</style>
    </>
  );
};
