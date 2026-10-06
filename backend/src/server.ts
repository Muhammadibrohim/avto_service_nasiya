import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./db.js";
import { router } from "./routes.js";

const app=express();
const port=Number(process.env.PORT||3000);

app.use(cors({origin:process.env.FRONTEND_URL?.split(",").map(v=>v.trim())||true}));
app.use(express.json());

app.get("/health",async(_req,res)=>{
  try { await prisma.$queryRaw`SELECT 1`; res.json({ok:true,db:true,service:"avto-service-nasiya-api"}); }
  catch { res.status(503).json({ok:false,db:false,service:"avto-service-nasiya-api"}); }
});

app.use("/api",router);
app.listen(port,"0.0.0.0",()=>console.log(`AVTO SERVICE NASIYA API: http://0.0.0.0:${port}`));