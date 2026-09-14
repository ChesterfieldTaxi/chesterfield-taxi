import { HeroBannerSection } from './sections/HeroBannerSection';
import { QuickBookingCardSection } from './sections/QuickBookingCardSection';
import { FlatTariffMatrixSection } from './sections/FlatTariffMatrixSection';
import { FleetShowcaseSection } from './sections/FleetShowcaseSection';
import { ServiceAreaListSection } from './sections/ServiceAreaListSection';
import { TestimonialCarouselSection } from './sections/TestimonialCarouselSection';
import { ContactBarSection } from './sections/ContactBarSection';
import { CustomHtmlSection } from './sections/CustomHtmlSection';

export const SECTION_REGISTRY: Record<string, React.FC<any>> = {
  'hero': HeroBannerSection,
  'booking-card': QuickBookingCardSection,
  'tariff-matrix': FlatTariffMatrixSection,
  'fleet-showcase': FleetShowcaseSection,
  'service-areas': ServiceAreaListSection,
  'testimonials': TestimonialCarouselSection,
  'contact-bar': ContactBarSection,
  'custom-html': CustomHtmlSection,
};

export const getSectionComponent = (type: string): React.FC<any> | null => {
  return SECTION_REGISTRY[type] || null;
};
