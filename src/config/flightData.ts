export const airlines = [
    "Southwest Airlines",
    "American Airlines",
    "Delta Air Lines",
    "United Airlines",
    "Alaska Airlines",
    "Frontier Airlines",
    "Spirit Airlines",
    "Air Canada",
    "Lufthansa",
    "Sun Country Airlines",
    "Southern Airways Express",
    "Cape Air"
].sort();

export interface Airport {
    code: string;
    city: string;
    name: string;
}

export const airports: Airport[] = [
    { code: "ATL", city: "Atlanta", name: "Hartsfield-Jackson Atlanta International Airport" },
    { code: "AUS", city: "Austin", name: "Austin-Bergstrom International Airport" },
    { code: "BNA", city: "Nashville", name: "Nashville International Airport" },
    { code: "BOS", city: "Boston", name: "Logan International Airport" },
    { code: "BWI", city: "Baltimore", name: "Baltimore/Washington International Thurgood Marshall Airport" },
    { code: "CLT", city: "Charlotte", name: "Charlotte Douglas International Airport" },
    { code: "DAL", city: "Dallas", name: "Dallas Love Field" },
    { code: "DCA", city: "Washington D.C.", name: "Ronald Reagan Washington National Airport" },
    { code: "DEN", city: "Denver", name: "Denver International Airport" },
    { code: "DFW", city: "Dallas/Fort Worth", name: "Dallas/Fort Worth International Airport" },
    { code: "DTW", city: "Detroit", name: "Detroit Metropolitan Wayne County Airport" },
    { code: "EWR", city: "Newark", name: "Newark Liberty International Airport" },
    { code: "FLL", city: "Fort Lauderdale", name: "Fort Lauderdale-Hollywood International Airport" },
    { code: "HOU", city: "Houston", name: "William P. Hobby Airport" },
    { code: "IAD", city: "Washington D.C.", name: "Washington Dulles International Airport" },
    { code: "IAH", city: "Houston", name: "George Bush Intercontinental Airport" },
    { code: "JFK", city: "New York", name: "John F. Kennedy International Airport" },
    { code: "LAS", city: "Las Vegas", name: "Harry Reid International Airport" },
    { code: "LAX", city: "Los Angeles", name: "Los Angeles International Airport" },
    { code: "LGA", city: "New York", name: "LaGuardia Airport" },
    { code: "MCO", city: "Orlando", name: "Orlando International Airport" },
    { code: "MDW", city: "Chicago", name: "Midway International Airport" },
    { code: "MIA", city: "Miami", name: "Miami International Airport" },
    { code: "MSP", city: "Minneapolis", name: "Minneapolis-Saint Paul International Airport" },
    { code: "ORD", city: "Chicago", name: "O'Hare International Airport" },
    { code: "PHL", city: "Philadelphia", name: "Philadelphia International Airport" },
    { code: "PHX", city: "Phoenix", name: "Phoenix Sky Harbor International Airport" },
    { code: "SAN", city: "San Diego", name: "San Diego International Airport" },
    { code: "SEA", city: "Seattle", name: "Seattle-Tacoma International Airport" },
    { code: "SFO", city: "San Francisco", name: "San Francisco International Airport" },
    { code: "SLC", city: "Salt Lake City", name: "Salt Lake City International Airport" },
    { code: "STL", city: "St. Louis", name: "St. Louis Lambert International Airport" },
    { code: "TPA", city: "Tampa", name: "Tampa International Airport" }
];
