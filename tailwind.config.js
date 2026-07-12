/** @type {import('tailwindcss').Config} */
// All colors below are exact values from the official Nexdigm brand palette.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nx: {
          purple: "#645BA8",
          purpleT1: "#776DA7",
          purpleT2: "#9F91C6",
          purpleT3: "#C6BDDD",
          purpleS1: "#2C2561",
          purpleS2: "#211C48",
          vivid: "#4012A6",
          magenta: "#C86AA9",
          magentaT2: "#DFA6CC",
          magentaT3: "#ECCAE0",
          magentaS1: "#712B69",
          magentaS2: "#55204F",
          ink: "#333333",
          gray1: "#808081",
          gray2: "#B5B5B6",
          gray3: "#CAC8C7",
          gray4: "#DFDDDD",
          inkS1: "#282526",
          yellow: "#D9E138",
          yellowT4: "#F4F5C9",
          green: "#2D7D3E",
          greenT4: "#C4E4C4",
          greenS1: "#1C4924",
          teal: "#26AD8B",
          tealT4: "#D0E7DF",
          tealS1: "#217A62",
          orange: "#F0AA31",
          orangeT4: "#FBE5C3",
          orangeS2: "#725220",
          bluegray: "#467082",
          bluegrayT4: "#D9E1E5",
          bluegrayS1: "#355462"
        }
      },
      fontFamily: {
        sans: ["Arial", "Helvetica", "sans-serif"]
      }
    }
  },
  plugins: []
};
