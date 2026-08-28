import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 96,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "-4px",
          background:
            "linear-gradient(135deg, #ff7a30 0%, #ff4e62 100%)",
        }}
      >
        bg
      </div>
    ),
    { ...size }
  );
}
