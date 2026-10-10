import React from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";

const tg=(window as any).Telegram?.WebApp;
const API=import.meta.env.VITE_API_URL||"http://localhost:3000";

async function api(path:string,options:RequestInit={}){
  const h=new Headers(options.headers);
  h.set("Content-Type","application/json");
  if(tg?.initData) h.set("x-telegram-init-data",tg.initData);
  const r=await fetch(API+"/api"+path,{...options,headers:h});
  if(!r.ok) throw new Error((await r.json().catch(()=>({}))).error||"Server xatosi");
  return r.json();
}
function money(v:any){return new Intl.NumberFormat("uz-UZ").format(Number(v||0))}
function date(v:any){return v?new Date(v).toLocaleDateString("uz-UZ"):"—"}
function dateTime(v:any){return v?new Date(v).toLocaleString("uz-UZ",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—"}

function App(){
  const[tab,setTab]=React.useState("dashboard"),[me,setMe]=React.useState<any>(null),[a,setA]=React.useState<any>(null);
  const[customers,setCustomers]=React.useState<any[]>([]),[services,setServices]=React.useState<any[]>([]),[parts,setParts]=React.useState<any[]>([]);
  const[orders,setOrders]=React.useState<any[]>([]),[debts,setDebts]=React.useState<any[]>([]),[selectedCustomer,setSelectedCustomer]=React.useState<any>(null),[err,setErr]=React.useState("");
  const load=async()=>{
    try{const[m,x,c,s,p,o,d]=await Promise.all([api("/me"),api("/analytics"),api("/customers"),api("/services"),api("/parts"),api("/orders"),api("/debts")]);
      setMe(m);setA(x);setCustomers(c);setServices(s);setParts(p);setOrders(o);setDebts(d);
    }catch(e:any){setErr(e.message)}
  };
  React.useEffect(()=>{tg?.ready?.();tg?.expand?.();api("/auth/telegram",{method:"POST"}).then(load).catch(e=>setErr(e.message))},[]);
  if(err)return <main><h1>AVTO SERVICE NASIYA</h1><div className="error">{err}</div><p>Telegram Mini App ichidan oching.</p></main>;

  const openCustomer=(c:any)=>{setSelectedCustomer(c);setTab("profile")};
  return <div className="app">
    <header><div><small>AVTO SERVICE NASIYA</small><h1>{me?.workshop?.name||"Avto Service"}</h1></div><span className="avatar">{(me?.user?.name||"A")[0]}</span></header>
    <main>
      {tab==="dashboard"&&<Dashboard a={a} orders={orders} debts={debts} setTab={setTab} onOpen={openCustomer}/>}
      {tab==="customers"&&<Customers customers={customers} onDone={load} onOpen={openCustomer}/>}
      {tab==="profile"&&selectedCustomer&&<CustomerProfile customer={selectedCustomer} orders={orders.filter(x=>x.customerId===selectedCustomer.id)} onBack={()=>setTab("customers")} />}
      {tab==="payments"&&<Payments orders={orders.filter(x=>Number(x.debt)>0)} onDone={load}/>}
      {tab==="service"&&<ServiceForm customers={customers} services={services} parts={parts} onDone={load}/>}
      {tab==="debts"&&<Debtors debts={debts} onOpen={openCustomer}/>}
      {tab==="history"&&<History orders={orders}/>}
      {tab==="analytics"&&<Analytics a={a}/>}
      {tab==="settings"&&<section className="panel"><h2>Sozlamalar</h2><p>Ustaxona: {me?.workshop?.name}</p><p>Foydalanuvchi: {me?.user?.name}</p><p>Telegram Mini App: <b>LIVE</b></p></section>}
      {tab==="more"&&<More setTab={setTab}/>}
    </main>
    <nav>{[
      ["⌂","Dashboard","dashboard"],["👥","Mijozlar","customers"],["💳","To‘lov","payments"],["☰","Ko‘proq","more"]
    ].map(x=><button className={tab===x[2]?"active":""} onClick={()=>setTab(x[2])} key={x[2]}><span>{x[0]}</span>{x[1]}</button>)}</nav>
  </div>
}

function Dashboard(p:{a:any;orders:any[];debts:any[];setTab:(x:string)=>void;onOpen:(x:any)=>void}){
  const today=new Date();today.setHours(0,0,0,0);
  const reminderLimit=new Date(today);reminderLimit.setDate(reminderLimit.getDate()+3);
  const reminders=p.debts.filter(x=>{
    if(Number(x.debt)<=0||!x.dueDate)return false;
    const due=new Date(x.dueDate);due.setHours(0,0,0,0);
    return due<=reminderLimit;
  }).sort((a,b)=>new Date(a.dueDate).getTime()-new Date(b.dueDate).getTime());
  return <><section className="hero"><span>XASANBOY AUTO SERVICE</span><strong>Boshqaruv paneli</strong><p>Servis, mijoz va qarzdorliklar bir joyda.</p></section>
  {reminders.length>0&&<section className="panel reminder-panel"><div className="sectionHead reminder-heading"><h2>🔔 To‘lov muddati eslatmalari</h2><b>{reminders.length}</b></div><p>To‘lov muddati o‘tgan yoki keyingi 3 kun ichida keladigan qarzlar.</p><div className="list">{reminders.slice(0,5).map(x=>{const due=new Date(x.dueDate);due.setHours(0,0,0,0);const days=Math.round((due.getTime()-today.getTime())/86400000);return <div className="row reminder-row" key={x.id} onClick={()=>x.customer&&p.onOpen(x.customer)} style={{cursor:"pointer"}}><div><b>{x.customer?.name||"Mijoz"}</b><small>{days<0?"⚠️ Muddati o‘tgan":days===0?"⚠️ Bugun to‘lash kerak":`📅 ${date(x.dueDate)} gacha`} · 🚗 {x.vehicle?.plate||"—"}</small></div><strong>{money(x.debt)} so‘m</strong></div>})}</div>{reminders.length>5&&<button className="back" onClick={()=>p.setTab("debts")}>Barcha eslatmalarni ko‘rish</button>}</section>}
  <section className="grid"><Card n={p.a?.orders??0} t="Buyurtmalar"/><Card n={money(p.a?.revenue)+" so‘m"} t="Aylanma"/><Card n={money(p.a?.paid)+" so‘m"} t="To‘langan"/><Card n={money(p.a?.debt)+" so‘m"} t="Qarz"/></section>
  <button className="primary" onClick={()=>p.setTab("service")}>＋ YANGI SERVIS</button>
  <div className="quick"><button onClick={()=>p.setTab("debts")}>🔴 Qarzdorlar <b>{p.debts.length}</b></button><button onClick={()=>p.setTab("analytics")}>📊 Analitika</button></div>
</>
}

function Card(p:{n:any;t:string}){return <div className="card"><strong>{p.n}</strong><span>{p.t}</span></div>}
function SectionTitle(p:{title:string;count?:any}){return <div className="sectionHead"><h2>{p.title}</h2>{p.count!==undefined&&<b>{p.count}</b>}</div>}

function List(p:{title:string;items:any[];amountKey?:string;customer?:boolean;onOpen?:(x:any)=>void}){
  return <section>{p.title&&<div className="sectionHead"><h2>{p.title}</h2></div>}
  <div className="list">{p.items.map(x=><div className="row" key={x.id} onClick={()=>p.onOpen?.(x.customer||x)}>
    <div><b>{p.customer?x.name:x.customer?.name||"Mijoz"}</b><small>{p.customer?(x.vehicles?.map((v:any)=>v.plate).join(" · ")||x.phone||""):x.vehicle?.plate||"—"}</small></div>
    {!p.customer&&<strong>{money(x[p.amountKey||"total"])} so‘m</strong>}
  </div>)}{!p.items.length&&<div className="empty">Ma’lumot yo‘q</div>}</div></section>
}

function Customers(p:{customers:any[];onDone:()=>void;onOpen:(x:any)=>void}){
  const[name,setName]=React.useState(""),[phone,setPhone]=React.useState(""),[make,setMake]=React.useState(""),[plate,setPlate]=React.useState(""),[q,setQ]=React.useState(""),[showAdd,setShowAdd]=React.useState(false);
  const[busy,setBusy]=React.useState(false),[msg,setMsg]=React.useState("");
  const filtered=p.customers.filter(x=>`${x.name||""} ${x.phone||""} ${(x.vehicles||[]).map((v:any)=>v.plate||"").join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()));
  const add=async()=>{
    if(!name.trim())return setMsg("Ism kiriting");
    if(!phone.trim())return setMsg("Telefon raqamini kiriting");
    if(!make.trim()||!plate.trim())return setMsg("Mashina markasi va davlat raqamini kiriting");
    setBusy(true);setMsg("");
    try{
      const customer=await api("/customers",{method:"POST",body:JSON.stringify({name:name.trim(),phone:phone.trim()})});
      try{
        await api("/vehicles",{method:"POST",body:JSON.stringify({customerId:customer.id,make:make.trim(),plate:plate.trim().toUpperCase()})});
      }catch(e:any){setMsg("⚠️ Mijoz saqlandi, lekin mashina saqlanmadi: "+e.message);p.onDone();return;}
      setName("");setPhone("");setMake("");setPlate("");setQ("");setShowAdd(false);
      setMsg("✅ Mijoz va mashina saqlandi");p.onDone();
    }catch(e:any){setMsg("❌ "+e.message)}finally{setBusy(false)}
  };
  return <section><SectionTitle title="Mijozlar" count={p.customers.length}/>
    <button className="primary" onClick={()=>{setShowAdd(!showAdd);setMsg("")}}>{showAdd?"✕ BEKOR QILISH":"＋ MIJOZ QO‘SHISH"}</button>
    {showAdd&&<section className="panel"><h3>Yangi mijoz</h3>
      <input placeholder="Ism familiya" value={name} onChange={e=>setName(e.target.value)}/>
      <input placeholder="+998 telefon raqami" value={phone} onChange={e=>setPhone(e.target.value)}/>
      <input placeholder="Mashina markasi (Cobalt, Malibu...)" value={make} onChange={e=>setMake(e.target.value)}/>
      <input placeholder="Davlat raqami" value={plate} onChange={e=>setPlate(e.target.value)}/>
      <button className="primary" disabled={busy} onClick={add}>{busy?"Saqlanmoqda...":"SAQLASH"}</button>
    </section>}
    <input placeholder="🔎 Mijoz qidirish: ism, telefon yoki raqam" value={q} onChange={e=>setQ(e.target.value)}/>
    {msg&&<p>{msg}</p>}<List title="" items={filtered} customer onOpen={p.onOpen}/></section>
}

function CustomerProfile(p:{customer:any;orders:any[];onBack:()=>void}){
  const c=p.customer; const total=p.orders.reduce((s,x)=>s+Number(x.total||0),0), paid=p.orders.reduce((s,x)=>s+Number(x.paid||0),0);
  const payments=p.orders.flatMap((order:any)=>(order.payments||[]).map((payment:any)=>({...payment,order}))).sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  return <section><button className="back" onClick={p.onBack}>← Mijozlarga</button><section className="hero"><span>MIJOZ PROFILI</span><strong>{c.name}</strong><p>📞 {c.phone||"Telefon kiritilmagan"}</p></section>
    <div className="grid"><Card n={c.vehicles?.length||0} t="Avtomobil"/><Card n={p.orders.length} t="Servis"/><Card n={money(total)+" so‘m"} t="Jami servis"/><Card n={money(Math.max(0,total-paid))+" so‘m"} t="Qarz"/></div>
    <section><SectionTitle title="Avtomobillar" count={c.vehicles?.length||0}/><div className="list">{(c.vehicles||[]).map((v:any)=><div className="row" key={v.id}><div><b>🚗 {v.make} {v.model||""}</b><small>{v.plate}</small></div></div>)}</div></section>
    <section><SectionTitle title="To‘lovlar tarixi" count={payments.length}/><div className="list">{payments.map((payment:any)=><div className="row" key={payment.id}><div><b>💰 {money(payment.amount)} so‘m</b><small>{dateTime(payment.createdAt)} · {payment.order?.vehicle?.plate||"Avtomobil"} · {payment.note||"To‘lov"}</small></div><span>{payment.method==="cash"?"Naqd":payment.method==="card"?"Karta":payment.method==="transfer"?"O‘tkazma":"Boshqa"}</span></div>)}{!payments.length&&<div className="empty">Hali to‘lov kiritilmagan</div>}</div></section>
    <History orders={p.orders}/></section>
}

function ServiceForm(p:{customers:any[];services:any[];parts:any[];onDone:()=>void}){
  const[q,setQ]=React.useState(""),[c,setC]=React.useState(""),[v,setV]=React.useState(""),[newMode,setNewMode]=React.useState(false);
  const[newName,setNewName]=React.useState(""),[newPhone,setNewPhone]=React.useState(""),[make,setMake]=React.useState(""),[model,setModel]=React.useState(""),[plate,setPlate]=React.useState("");
  const[name,setName]=React.useState(""),[price,setPrice]=React.useState(""),[items,setItems]=React.useState<any[]>([]),[paid,setPaid]=React.useState(""),[due,setDue]=React.useState(""),[busy,setBusy]=React.useState(false),[msg,setMsg]=React.useState(""),[localCustomer,setLocalCustomer]=React.useState<any>(null);
  const selected=localCustomer?.id===c?localCustomer:p.customers.find(x=>x.id===c);
  const filtered=p.customers.filter(x=>`${x.name} ${x.phone||""}`.toLowerCase().includes(q.toLowerCase()));
  const createCustomer=async()=>{
    if(!newName.trim()||!newPhone.trim()||!make.trim()||!plate.trim())return setMsg("Ism, telefon, mashina markasi va davlat raqamini kiriting");
    setBusy(true);setMsg("");
    try{
      const created=await api("/customers",{method:"POST",body:JSON.stringify({name:newName.trim(),phone:newPhone.trim()})});
      try{
        const vehicle=await api("/vehicles",{method:"POST",body:JSON.stringify({customerId:created.id,make:make.trim(),plate:plate.trim().toUpperCase()})});
        const customer={...created,vehicles:[vehicle]};
        setLocalCustomer(customer);setC(created.id);setV(vehicle.id);setNewMode(false);setQ("");
        setNewName("");setNewPhone("");setMake("");setPlate("");
        setMsg("✅ Mijoz va mashina saqlandi. Endi servis ma’lumotlarini kiriting.");p.onDone();
      }catch(e:any){setMsg("⚠️ Mijoz saqlandi, mashina saqlanmadi: "+e.message);p.onDone()}
    }catch(e:any){setMsg("❌ "+e.message)}finally{setBusy(false)}
  };
  const createVehicle=async()=>{if(!c||!make.trim()||!plate.trim())return setMsg("Marka va davlat raqamini kiriting");setBusy(true);try{const created=await api("/vehicles",{method:"POST",body:JSON.stringify({customerId:c,make:make.trim(),model:model.trim(),plate:plate.trim().toUpperCase()})});const current=selected||{id:c,vehicles:[]};setLocalCustomer({...current,vehicles:[...(current.vehicles||[]),created]});setV(created.id);setMake("");setModel("");setPlate("");setMsg("✅ Avtomobil qo‘shildi");p.onDone()}catch(e:any){setMsg("❌ "+e.message)}finally{setBusy(false)}};
  const add=()=>{if(!name.trim()||!price)return setMsg("Ish/detal va narx kiriting");setItems([...items,{name:name.trim(),unitPrice:Number(price),quantity:1}]);setName("");setPrice("")};
  const submit=async()=>{if(!c||!v||!items.length)return setMsg("Mijoz, avtomobil va kamida bitta ish kiriting");setBusy(true);try{await api("/orders",{method:"POST",body:JSON.stringify({customerId:c,vehicleId:v,items,paid:Number(paid||0),dueDate:due||null})});setMsg("✅ Servis yaratildi");setItems([]);setPaid("");setDue("");p.onDone()}catch(e:any){setMsg("❌ "+e.message)}finally{setBusy(false)}};
  return <section><SectionTitle title="Yangi servis"/>
    {!selected&&!newMode&&<><button className="primary" onClick={()=>{setNewMode(true);setMsg("")}}>＋ YANGI MIJOZ QO‘SHISH</button><input placeholder="🔎 Mijoz qidirish: ism yoki telefon" value={q} onChange={e=>setQ(e.target.value)}/><div className="list">{filtered.slice(0,8).map(x=><div className="row" key={x.id} onClick={()=>{setC(x.id);setV("");setLocalCustomer(null);setQ(x.name)}}><div><b>{x.name}</b><small>{x.phone||"Telefon yo‘q"} · {x.vehicles?.length||0} ta avtomobil</small></div></div>)}{!filtered.length&&<div className="empty">Mijoz topilmadi</div>}</div></>}
    {newMode&&<section className="panel"><h3>👤 Yangi mijoz</h3><input placeholder="Ism familiya" value={newName} onChange={e=>setNewName(e.target.value)}/><input placeholder="+998 telefon raqami" value={newPhone} onChange={e=>setNewPhone(e.target.value)}/><input placeholder="Mashina markasi (Cobalt, Malibu...)" value={make} onChange={e=>setMake(e.target.value)}/><input placeholder="Davlat raqami" value={plate} onChange={e=>setPlate(e.target.value)}/><button className="primary" disabled={busy} onClick={createCustomer}>{busy?"Saqlanmoqda...":"MIJOZNI SAQLASH"}</button><button className="back" onClick={()=>{setNewMode(false);setMake("");setPlate("")}}>← Mavjud mijozlardan tanlash</button></section>}
    {selected&&<><div className="panel"><h3>👤 {selected.name}</h3><p>{selected.phone||"Telefon kiritilmagan"}</p><button className="back" onClick={()=>{setC("");setV("");setLocalCustomer(null);setQ("")}}>← Boshqa mijoz</button></div>
      {!selected.vehicles?.length&&!v&&<div className="panel"><h3>🚗 Avtomobil qo‘shish</h3><input placeholder="Marka (Cobalt, Malibu...)" value={make} onChange={e=>setMake(e.target.value)}/><input placeholder="Model" value={model} onChange={e=>setModel(e.target.value)}/><input placeholder="Davlat raqami" value={plate} onChange={e=>setPlate(e.target.value)}/><button className="primary" disabled={busy} onClick={createVehicle}>{busy?"Saqlanmoqda...":"＋ AVTOMOBILNI SAQLASH"}</button></div>}
      {!!selected.vehicles?.length&&<select value={v} onChange={e=>setV(e.target.value)}><option value="">Avtomobilni tanlang</option>{selected.vehicles.map((x:any)=><option key={x.id} value={x.id}>{x.make} {x.model||""} — {x.plate}</option>)}</select>}
      {v&&<><div className="addline"><input placeholder="Ish / detal nomi" value={name} onChange={e=>setName(e.target.value)}/><input type="number" placeholder="Narx" value={price} onChange={e=>setPrice(e.target.value)}/><button onClick={add}>＋</button></div>{items.map((x,i)=><div className="row" key={i}><span>{x.name}</span><b>{money(x.unitPrice)} so‘m</b></div>)}<input type="number" placeholder="Boshlang‘ich to‘lov" value={paid} onChange={e=>setPaid(e.target.value)}/><input type="date" value={due} onChange={e=>setDue(e.target.value)}/><button className="primary" disabled={busy} onClick={submit}>{busy?"Saqlanmoqda...":"SERVISNI SAQLASH"}</button></>}
    </>}{msg&&<p>{msg}</p>}</section>
}
function Payments(p:{orders:any[];onDone:()=>void}){
  const[o,setO]=React.useState(""),[amount,setAmount]=React.useState(""),[msg,setMsg]=React.useState(""),[q,setQ]=React.useState("");
  const filtered=p.orders.filter(x=>`${x.customer?.name||""} ${x.vehicle?.plate||""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const selected=p.orders.find(x=>x.id===o);
  const pay=async()=>{if(!o||Number(amount)<=0)return setMsg("Buyurtma va summa kiriting");try{await api("/payments",{method:"POST",body:JSON.stringify({orderId:o,amount:Number(amount)})});setMsg("✅ To‘lov saqlandi");setAmount("");setQ("");setO("");p.onDone()}catch(e:any){setMsg("❌ "+e.message)}};
  return <section><SectionTitle title="To‘lov kiritish" count={p.orders.length}/>
    <input placeholder="🔎 Ism yoki mashina raqami bo‘yicha qidirish" value={q} onChange={e=>{setQ(e.target.value);setO("");setMsg("")}}/>
    {q.trim()!==""&&<div className="list">{filtered.slice(0,10).map(x=><div className="row" key={x.id} onClick={()=>{setO(x.id);setMsg("")}} style={{border:o===x.id?"1px solid #f59e0b":undefined,cursor:"pointer"}}><div><b>{x.customer?.name||"Mijoz"}</b><small>🚗 {x.vehicle?.plate||"Raqamsiz avtomobil"}</small></div><strong>{money(x.debt)} so‘m</strong></div>)}{!filtered.length&&<div className="empty">Mos qarzdor topilmadi</div>}</div>}
    {selected&&<div className="panel"><b>{selected.customer?.name} · {selected.vehicle?.plate}</b><p>Qolgan qarz: <strong>{money(selected.debt)} so‘m</strong></p></div>}
    <input type="number" placeholder="To‘lov summasi" value={amount} onChange={e=>setAmount(e.target.value)}/><button className="primary" onClick={pay}>TO‘LOVNI SAQLASH</button>{msg&&<p>{msg}</p>}</section>
}
function Debtors(p:{debts:any[];onOpen:(x:any)=>void}){return <section><SectionTitle title="Qarzdorlar" count={p.debts.length}/><div className="list">{p.debts.map(x=><div className="row" key={x.id} onClick={()=>p.onOpen(x.customer)}><div><b>{x.customer?.name}</b><small>🚗 {x.vehicle?.plate} · {x.dueDate?date(x.dueDate):"Muddat belgilanmagan"}</small></div><strong>{money(x.debt)} so‘m</strong></div>)}</div>{!p.debts.length&&<div className="empty">Qarzdor yo‘q 🎉</div>}</section>}

function History(p:{orders:any[]}){
  return <section><SectionTitle title="Servis tarixi" count={p.orders.length}/><div className="list">{p.orders.map(x=><div className="row" key={x.id}><div><b>{x.customer?.name} · {x.vehicle?.plate}</b><small>{date(x.createdAt)} · {x.status} · {x.items?.map((i:any)=>i.name).join(", ")||"Ish yo‘q"}</small></div><strong>{money(x.total)} so‘m</strong></div>)}</div>{!p.orders.length&&<div className="empty">Servis tarixi bo‘sh</div>}</section>
}

function Analytics(p:{a:any}){const revenue=Number(p.a?.revenue||0),paid=Number(p.a?.paid||0),debt=Number(p.a?.debt||0);return <section><SectionTitle title="Analitika" count={p.a?.orders||0}/><section className="panel"><h3>Moliyaviy ko‘rsatkichlar</h3><p>Aylanma: <b>{money(revenue)} so‘m</b></p><p>To‘langan: <b>{money(paid)} so‘m</b></p><p>Qarz: <b>{money(debt)} so‘m</b></p><p>Yopilgan ulush: <b>{revenue?Math.round(paid/revenue*100):0}%</b></p></section></section>}

function More(p:{setTab:(x:string)=>void}){return <section><SectionTitle title="Qo‘shimcha" /><div className="quick vertical"><button onClick={()=>p.setTab("debts")}>🔴 Qarzdorlar</button><button onClick={()=>p.setTab("history")}>🧾 Servis tarixi</button><button onClick={()=>p.setTab("analytics")}>📊 Analitika</button><button onClick={()=>p.setTab("settings")}>⚙️ Sozlamalar</button></div>{/* settings is rendered below through this shortcut */}</section>}

createRoot(document.getElementById("root")!).render(<App/>);
