import React from 'react';
import { getSectionComponent } from './SectionRegistry';

export interface DynamicPageRendererProps {
  layout: Array<{
    id: string;
    type: string;
    isEnabled: boolean;
    props: Record<string, any>;
  }>;
}

export const DynamicPageRenderer: React.FC<DynamicPageRendererProps> = ({ layout }) => {
  if (!layout || layout.length === 0) {
    return null;
  }

  return (
    <div className="dynamic-page-renderer">
      {layout.filter(section => section.isEnabled).map((section) => {
        const Component = getSectionComponent(section.type);
        if (!Component) {
          console.warn(`DynamicPageRenderer: Unknown section type "${section.type}"`);
          return null;
        }
        return <Component key={section.id} {...section.props} />;
      })}
    </div>
  );
};
