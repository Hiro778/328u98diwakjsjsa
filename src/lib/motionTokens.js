// Shared Motion animation tokens, easings, and variants
// Optimized for React 19 + motion/react

export const editorialEase = [0.22, 1, 0.36, 1];
export const smoothEase = [0.16, 1, 0.3, 1];

export const textRevealVariants = {
  hidden: { opacity: 0, y: 48 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      delay: i * 0.1,
      ease: editorialEase,
    },
  }),
};

export const containerStaggerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

export const fadeUpVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: editorialEase,
    },
  },
};

export const scaleFadeVariants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.9,
      ease: smoothEase,
    },
  },
};
