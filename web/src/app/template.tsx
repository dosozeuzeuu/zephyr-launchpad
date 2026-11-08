'use client';

import { motion, useReducedMotion } from 'framer-motion';

/** Every navigation re-mounts this, giving each page a soft rise-in. */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}
