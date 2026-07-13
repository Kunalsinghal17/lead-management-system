import React, { useState } from "react";

/**
 * Official Nexdigm logo, loaded from nexdigm.com. If the asset is unreachable
 * (offline dev, restricted network) it falls back to a brand-accurate SVG
 * wordmark using official palette colors only.
 *
 * To ship fully offline, download the file once into src/assets/ and switch
 * LOGO_URL to the local import:
 *   https://www.nexdigm.com/wp-content/themes/skgrouptheme/assets/img/nexdigm-logo.webp
 */
const LOGO_URL =
  "https://www.nexdigm.com/wp-content/themes/skgrouptheme/assets/img/nexdigm-logo.webp";

export default function NexdigmLogo({
  height = 28,
  onDark = false
}: {
  height?: number;
  onDark?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // Fallback wordmark — Nexdigm Purple (#645BA8) / white per background
    return (
      <svg
        height={height}
        viewBox="0 0 190 40"
        role="img"
        aria-label="Nexdigm"
        style={{ display: "block" }}
      >
        <text
          x="0"
          y="27"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="26"
          fontWeight="bold"
          letterSpacing="0.5"
          fill={onDark ? "#FFFFFF" : "#645BA8"}
        >
          nexdigm
        </text>
        <text
          x="1"
          y="38"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="8"
          letterSpacing="3.2"
          fill={onDark ? "#C6BDDD" : "#808081"}
        >
          THINK NEXT
        </text>
      </svg>
    );
  }

  const img = (
    <img
      src={LOGO_URL}
      alt="Nexdigm"
      style={{ height, display: "block" }}
      onError={() => setFailed(true)}
    />
  );

  // The official logo is purple-on-transparent; give it a white chip on dark surfaces.
  if (onDark) {
    return (
      <span
        className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5"
        style={{ lineHeight: 0 }}
      >
        {img}
      </span>
    );
  }
  return img;
}
