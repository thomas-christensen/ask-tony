"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function AnswerLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <motion.div
        initial={{ opacity: 0.6, scale: 0.95 }}
        animate={{ opacity: [0.6, 1, 0.6], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="flex items-center justify-center"
      >
        <Image
          src="/CUBE_2D_LIGHT.png"
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 object-contain"
          priority
        />
      </motion.div>
    </div>
  );
}

