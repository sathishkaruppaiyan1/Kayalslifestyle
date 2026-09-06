import Layout from "@/components/layout/Layout";
import PageBand from "@/components/layout/PageBand";

const SizeChart = () => {
  return (
    <Layout>
      <div className="bg-gray-50 min-h-[60vh]">
        <PageBand title="Size Chart" crumbs={[{ label: "Size Chart" }]} />
        <div className="container mx-auto px-4 py-8 lg:py-12 max-w-3xl">
          <div className="bg-background rounded-lg shadow-card p-4 lg:p-8">
            <img
              src="/size-chart.jpg"
              alt="Kayals Lifestyle Size Chart - Measurements in inches for sizes XS to 4XL"
              className="w-full h-auto rounded-lg animate-zoom-out"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SizeChart;
