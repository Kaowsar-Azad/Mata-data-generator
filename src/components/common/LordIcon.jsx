import React from "react";

export function LordIcon({
  src,
  trigger = "hover",
  size = 24,
  colors = "primary:#3b82f6,secondary:#64748b",
  delay,
  target,
  className = ""
}) {
  return (
    <lord-icon
      src={src}
      trigger={trigger}
      colors={colors}
      delay={delay}
      target={target}
      class={className}
      style={{ width: `${size}px`, height: `${size}px`, display: "inline-block", verticalAlign: "middle" }}
    />
  );
}
