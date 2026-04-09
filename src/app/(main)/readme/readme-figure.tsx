"use client";

import Image from "next/image";
import { useState } from "react";

export function ReadmeFigure({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  const [ok, setOk] = useState(true);

  if (!ok) {
    return (
      <figure className="flex aspect-[5/3] w-full flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 text-center dark:border-neutral-600 dark:bg-neutral-900/50">
        <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Missing image</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          Add <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">{src}</code>{" "}
          via{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
            npm run readme-screenshots
          </code>
        </p>
      </figure>
    );
  }

  return (
    <figure className="overflow-hidden rounded-xl border border-neutral-200/80 bg-neutral-100 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="relative aspect-[5/3] w-full">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover object-top"
          priority={priority}
          unoptimized
          onError={() => setOk(false)}
        />
      </div>
    </figure>
  );
}
