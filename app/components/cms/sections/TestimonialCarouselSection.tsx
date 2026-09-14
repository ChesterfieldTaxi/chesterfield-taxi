import React from 'react';

export interface TestimonialCarouselSectionProps {
  title?: string;
  testimonials?: Array<{ quote: string; author: string }>;
}

export const TestimonialCarouselSection: React.FC<TestimonialCarouselSectionProps> = ({
  title = 'What Our Customers Say',
  testimonials = [
    { quote: "Always on time, very professional.", author: "Jane D." },
    { quote: "Best ride to the airport I've ever had.", author: "Mark S." },
  ]
}) => {
  return (
    <section className="py-16 bg-slate-900 text-white">
      <div className="container mx-auto px-4 max-w-4xl text-center">
        <h2 className="text-3xl font-bold mb-10">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {testimonials.map((t, idx) => (
            <div key={idx} className="bg-slate-800 p-8 rounded-xl">
              <p className="text-lg italic text-slate-300 mb-4">"{t.quote}"</p>
              <p className="font-semibold text-primary-light">- {t.author}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
