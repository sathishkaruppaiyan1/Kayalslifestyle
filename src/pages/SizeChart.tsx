import Layout from "@/components/layout/Layout";

const SizeChart = () => {
  return (
    <Layout>
      <div className="bg-gray-50 min-h-[60vh]">
        <div className="bg-[#FFF9E5] py-8 text-center">
          <h1 className="font-heading text-3xl lg:text-4xl">Size Chart</h1>
          <p className="text-sm text-muted-foreground mt-2">Home &gt; Size Chart</p>
        </div>
        <div className="container mx-auto px-4 py-8 lg:py-12 max-w-3xl">
          <div className="bg-white rounded-lg shadow-sm p-4 lg:p-8">
            <img
              src="/size-chart.jpg"
              alt="Kayals Lifestyle Size Chart - Measurements in inches for sizes XS to 4XL"
              className="w-full h-auto rounded-lg"
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
