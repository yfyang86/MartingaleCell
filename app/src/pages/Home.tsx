import Hero from '@/components/home/Hero'
import FeatureTicker from '@/components/home/FeatureTicker'
import FeatureGrid from '@/components/home/FeatureGrid'
import HowItWorks from '@/components/home/HowItWorks'
import SupportTeaser from '@/components/home/SupportTeaser'
import CtaBand from '@/components/home/CtaBand'

export default function Home() {
  return (
    <>
      <Hero />
      <FeatureTicker />
      <FeatureGrid />
      <HowItWorks />
      <SupportTeaser />
      <CtaBand />
    </>
  )
}
