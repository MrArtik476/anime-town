import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

type ImageMockProps = { src: string; alt: string; className?: string; onError?: () => void };

// next/image требует конфигурацию Next.js — в unit-тестах достаточно обычного <img>.
vi.mock("next/image", () => ({
  default: ({ src, alt, className, onError }: ImageMockProps) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={onError} />
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));
