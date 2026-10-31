import { CatalogPreview } from "@/components/home/catalog-preview";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";
import { RoadmapSection } from "@/components/home/roadmap-section";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <CatalogPreview />
        <RoadmapSection />
      </main>
      <SiteFooter />
    </>
  );
}
