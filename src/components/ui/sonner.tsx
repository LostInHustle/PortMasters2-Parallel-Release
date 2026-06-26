"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Wider and taller than sonner's 356px default so a game-log line or
      // a chat preview is actually readable at a glance instead of getting
      // clipped down to a sliver of text.
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--width": "440px",
        } as React.CSSProperties
      }
      {...props}
      toastOptions={{
        className: "text-sm leading-relaxed py-1",
        ...props.toastOptions,
      }}
    />
  )
}

export { Toaster }
