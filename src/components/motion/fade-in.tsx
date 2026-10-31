"use client";

import { motion } from "motion/react";

type FadeInProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
};

/** Короткое появление снизу: только opacity и transform. */
export function FadeIn({ children, className, delay = 0 }: FadeInProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
