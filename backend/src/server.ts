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
async function configureTelegramMenu(){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  const url=process.env.TELEGRAM_MENU_URL||process.env.FRONTEND_URL?.split(",")[0]?.trim();
  if(!token||!url) return;
  try{
    const r=await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({menu_button:{type:"web_app",text:"🔧 AVTO SERVICE",web_app:{url}}})});
    const data=await r.json();
    console.log("Telegram menu button:",data?.ok?"configured":"failed");
  }catch(e){ console.error("Telegram menu setup failed:",e); }
}
app.listen(port,"0.0.0.0",()=>{console.log(`AVTO SERVICE NASIYA API: http://0.0.0.0:${port}`); void configureTelegramMenu();});