import { prisma } from "./src/lib/prisma";

async function main() {
  try {
    const results = await prisma.salesReport.findMany({
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        date: true,
        category: true,
        salesperson: true,
        salespersonEmail: true,
        orderCode: true,
        note: true
      }
    });

    console.log(`Total SalesReports: ${results.length}`);
    console.log("Latest 10 SalesReports:");
    const latest10 = results.slice(0, 10);
    console.log(JSON.stringify(latest10, null, 2));
  } catch (error) {
    console.error("Error during query execution:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();