"use client";

import { MotionConfig } from "motion/react";

/** Учитывает системную настройку prefers-reduced-motion для всех анимаций Motion. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
