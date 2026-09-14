import React from 'react';

export interface CustomHtmlSectionProps {
  htmlContent?: string;
}

export const CustomHtmlSection: React.FC<CustomHtmlSectionProps> = ({
  htmlContent = '<div>Custom HTML block</div>'
}) => {
  return (
    <section className="py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Intentionally dangerously setting inner HTML based on CMS config */}
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    </section>
  );
};
