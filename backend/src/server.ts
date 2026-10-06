import "dotenv/config";
import express from "express";
import cors from "cors";

const app=express();
const port=Number(process.env.PORT||3000);

app.use(cors({origin:process.env.FRONTEND_URL?.split(",").map(v=>v.trim())||true}));
app.use(express.json());

app.get("/health",(_req,res)=>res.json({ok:true,service:"avto-service-nasiya-api",version:"1.0.0"}));

app.listen(port,"0.0.0.0",()=>console.log(`AVTO SERVICE NASIYA API: http://0.0.0.0:${port}`));