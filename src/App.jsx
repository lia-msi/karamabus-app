import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  // --- ÉTATS SYSTÈME & AUTH ---
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState('controle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  // --- ÉTATS DONNÉES ---
  const [busList, setBusList] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [archivesEnvoi, setArchivesEnvoi] = useState([]);

  // --- ÉTATS FORMULAIRES ---
  const [numParc, setNumParc] = useState('');
  const [plaque, setPlaque] = useState('');
  const [modeleBus, setModeleBus] = useState('');
  const [boxSN, setBoxSN] = useState({ tablette: '', imprimante: '', nfc: '', cable: '', stabilisateur: '' });
  const [survSN, setSurvSN] = useState({ gps: '', mdvr: '', cam1: '', cam2: '', cam3: '', cam4: '', routeur: '', chrono: '' });
  const [itemName, setItemName] = useState('');
  const [itemSN, setItemSN] = useState('');
  const [itemCat, setItemCat] = useState('BOX');
  const [selectionEnvoi, setSelectionEnvoi] = useState([]);
  const [selectedBus, setSelectedBus] = useState('');
  const [oldSN, setOldSN] = useState('');
  const [newSN, setNewSN] = useState('');
  const [raison, setRaison] = useState('');

  // --- LOGIQUE AUTHENTIFICATION ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkRole(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkRole(session.user.id);
      else {
        setSession(null);
        setUserRole('controle');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkRole = async (userId) => {
    const { data } = await supabase.from('profils').select('role').eq('id', userId).single();
    if (data) setUserRole(data.role);
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erreur : " + error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUserRole('controle');
    window.location.href = "/"; // Forcer le retour au login
  };

  // --- CHARGEMENT DES DONNÉES ---
  async function fetchData() {
    const { data: bData } = await supabase.from('bus').select('*').order('numero_parc');
    setBusList(bData || []);
    const { data: iData } = await supabase.from('materiels').select('*, bus(numero_parc, modele)').eq('archive_envoi', false).order('nom');
    setInventory(iData || []);
    const { data: lData } = await supabase.from('maintenance_logs').select('*, bus(numero_parc)').order('date_intervention', { ascending: false });
    setLogs(lData || []);
    const { data: aData } = await supabase.from('rapports_envoi').select('*').order('date_envoi', { ascending: false });
    setArchivesEnvoi(aData || []);
  }

  useEffect(() => { if (session) fetchData(); }, [session]);

  // --- FONCTIONS ACTIONS (ADMIN) ---
  const handleAjoutCompletBus = async (e) => {
    e.preventDefault();
    if (userRole !== 'admin') return alert("Interdit");
    const { data: nouveauBus, error } = await supabase.from('bus').insert([{ numero_parc: numParc, plaque_immatriculation: plaque, modele: modeleBus }]).select();
    if (error) return alert(error.message);
    const busId = nouveauBus[0].id;
    const items = [
      { nom: 'Tablette', sn: boxSN.tablette, cat: 'BOX' }, { nom: 'Imprimante', sn: boxSN.imprimante, cat: 'BOX' },
      { nom: 'Lecteur NFC', sn: boxSN.nfc, cat: 'BOX' }, { nom: 'Câble Data', sn: boxSN.cable, cat: 'BOX' },
      { nom: 'Stabilisateur', sn: boxSN.stabilisateur, cat: 'BOX' }, { nom: 'GPS', sn: survSN.gps, cat: 'SURVEILLANCE' },
      { nom: 'MDVR', sn: survSN.mdvr, cat: 'SURVEILLANCE' }, { nom: 'Caméra 1', sn: survSN.cam1, cat: 'SURVEILLANCE' },
      { nom: 'Caméra 2', sn: survSN.cam2, cat: 'SURVEILLANCE' }, { nom: 'Caméra 3', sn: survSN.cam3, cat: 'SURVEILLANCE' },
      { nom: 'Caméra 4', sn: survSN.cam4, cat: 'SURVEILLANCE' }, { nom: 'Routeur', sn: survSN.routeur, cat: 'SURVEILLANCE' },
      { nom: 'Chronotachygraphe', sn: survSN.chrono, cat: 'SURVEILLANCE' },
    ];
    const aInserer = items.filter(e => e.sn !== '').map(e => ({ bus_id: busId, nom: e.nom.toUpperCase(), numero_serie: e.sn.toUpperCase(), categorie: e.cat, statut: 'Installé' }));
    if (aInserer.length > 0) await supabase.from('materiels').insert(aInserer);
    setNumParc(''); setPlaque(''); setModeleBus(''); fetchData(); setView('inventory');
  };

  const validerEchange = async (e) => {
    e.preventDefault();
    if (userRole !== 'admin') return alert("Interdit");
    await supabase.from('materiels').update({ en_panne: true, bus_id: null, statut: 'Défectueux' }).eq('numero_serie', oldSN.toUpperCase());
    await supabase.from('materiels').update({ bus_id: selectedBus, statut: 'Installé', en_panne: false }).eq('numero_serie', newSN.toUpperCase());
    await supabase.from('maintenance_logs').insert([{ bus_id: selectedBus, materiel_sortant_sn: oldSN.toUpperCase(), materiel_entrant_sn: newSN.toUpperCase(), raison_changement: raison }]);
    setOldSN(''); setNewSN(''); setRaison(''); fetchData();
  };

  const validerExpeditionSiege = async () => {
    if (userRole !== 'admin') return;
    if (selectionEnvoi.length === 0) return alert("Sélectionnez des articles");
    const selection = inventory.filter(i => selectionEnvoi.includes(i.id));
    const liste = selection.map(i => `${i.nom} (${i.numero_serie})`).join(', ');
    await supabase.from('rapports_envoi').insert([{ liste_materiels: liste, nb_articles: selectionEnvoi.length }]);
    await supabase.from('materiels').update({ archive_envoi: true, statut: 'Envoyé au Siège' }).in('id', selectionEnvoi);
    setSelectionEnvoi([]); fetchData(); window.print();
  };

  const handleReceptionStock = async (e) => {
    e.preventDefault();
    if (userRole !== 'admin') return;
    await supabase.from('materiels').insert([{ nom: itemName.toUpperCase(), numero_serie: itemSN.toUpperCase(), categorie: itemCat, statut: 'En Stock' }]);
    setItemName(''); setItemSN(''); fetchData();
  };

  const supprimerBus = async (id) => {
    if (userRole !== 'admin') return;
    if (window.confirm("Supprimer ce bus ?")) {
      await supabase.from('bus').delete().eq('id', id);
      fetchData();
    }
  };

  // --- UTILS ---
  const obtenirDateHeure = () => {
    const maintenant = new Date();
    return maintenant.toLocaleDateString() + ' à ' + maintenant.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const calculerStockRegroupe = () => {
    const reserve = inventory.filter(i => !i.bus_id && !i.en_panne);
    const regroupe = {};
    reserve.forEach(item => {
      const nom = item.nom.toUpperCase();
      if (!regroupe[nom]) regroupe[nom] = { quantite: 0 };
      regroupe[nom].quantite += 1;
    });
    return regroupe;
  };

  // --- RENDU : LOGIN ---
  if (!session && !loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#1a1a1a]">
        <form onSubmit={handleLogin} className="bg-white p-10 border-t-8 border-[#ff6600] w-96 shadow-2xl">
          <h1 className="text-2xl font-black mb-6 text-center uppercase">KARAMABUS LOGIN</h1>
          <div className="space-y-4">
            <input type="email" placeholder="Email" className="w-full border-2 p-3 font-bold" onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Mot de passe" className="w-full border-2 p-3 font-bold" onChange={e => setPassword(e.target.value)} required />
            <button className="w-full bg-[#ff6600] text-black font-black p-4 uppercase hover:bg-black hover:text-[#ff6600] transition-all">Accéder</button>
          </div>
        </form>
      </div>
    );
  }

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse">CHARGEMENT...</div>;

  // --- RENDU : APP ---
  return (
    <div className="flex h-screen bg-[#f4f4f4] font-sans text-slate-900 print:block">
      <aside className="w-72 bg-[#1a1a1a] text-white flex flex-col border-r-4 border-[#ff6600] print:hidden">
        <div className="p-8 bg-[#ff6600] text-black text-center font-black italic shadow-lg">
          <h1 className="text-2xl tracking-tighter">KARAMABUS</h1>
          <p className="text-[10px] uppercase font-bold tracking-widest">{userRole === 'admin' ? 'Administrateur' : 'Contrôleur'}</p>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-3 font-black text-[11px] uppercase">
          <button onClick={() => setView('dashboard')} className={`w-full text-left p-4 rounded ${view === 'dashboard' ? 'bg-[#ff6600] text-black' : 'hover:bg-white/5'}`}>📊 Situation</button>
          <button onClick={() => setView('inventory')} className={`w-full text-left p-4 rounded ${view === 'inventory' ? 'bg-[#ff6600] text-black' : 'hover:bg-white/5'}`}>📑 Inventaire Bus</button>
          
          {userRole === 'admin' && (
            <>
              <button onClick={() => setView('bus')} className={`w-full text-left p-4 rounded ${view === 'bus' ? 'bg-[#ff6600] text-black' : 'hover:bg-white/5'}`}>🚌 Gestion Flotte</button>
              <button onClick={() => setView('maintenance')} className={`w-full text-left p-4 rounded ${view === 'maintenance' ? 'bg-[#ff6600] text-black' : 'hover:bg-white/5'}`}>🔧 Interventions</button>
              <button onClick={() => setView('stock')} className={`w-full text-left p-4 rounded ${view === 'stock' ? 'bg-[#ff6600] text-black' : 'hover:bg-white/5'}`}>📦 Stock & Envois</button>
            </>
          )}
          <button onClick={handleLogout} className="w-full text-left p-4 text-red-500 mt-10 hover:bg-red-600 hover:text-white rounded transition-all">🚪 Déconnexion</button>
        </nav>
      </aside>

      <main className="flex-1 p-10 overflow-auto print:p-0">
        <div className="hidden print:flex justify-between items-center border-b-4 border-black mb-8 pb-4">
          <h1 className="text-2xl font-black uppercase italic italic">KARAMABUS KHENIFRA — Rapport Technique</h1>
          <p className="font-bold text-sm">Le {obtenirDateHeure()}</p>
        </div>

        {/* --- DASHBOARD --- */}
        {view === 'dashboard' && (
          <div className="space-y-8">
            <h2 className="text-3xl font-black border-b-8 border-[#ff6600] inline-block uppercase italic">Situation Technique</h2>
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white p-6 border-4 border-black text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"><p className="text-[10px] font-black text-gray-400 uppercase">Bus Actifs</p><p className="text-5xl font-black">{busList.length}</p></div>
              <div className="bg-white p-6 border-4 border-[#ff6600] text-center"><p className="text-[10px] font-black text-[#ff6600] uppercase">Pièces Réserve</p><p className="text-5xl font-black text-blue-600">{inventory.filter(i => !i.bus_id && !i.en_panne).length}</p></div>
              <div className="bg-black p-6 border-4 border-black text-center text-red-500"><p className="text-[10px] font-black uppercase text-red-500">Pannes</p><p className="text-5xl font-black">{inventory.filter(i => i.en_panne).length}</p></div>
            </div>
          </div>
        )}

        {/* --- INVENTAIRE --- */}
        {view === 'inventory' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center border-b-8 border-[#ff6600] pb-2">
              <h2 className="text-3xl font-black uppercase italic">État de la Flotte</h2>
              <button onClick={() => window.print()} className="bg-black text-[#ff6600] px-4 py-2 font-black text-xs uppercase print:hidden">🖨️ Imprimer Rapport</button>
            </div>
            {busList.map(bus => (
              <div key={bus.id} className="bg-white border-4 border-black mb-10 break-inside-avoid shadow-xl">
                <div className="bg-black text-[#ff6600] p-4 font-black flex justify-between uppercase italic text-sm">
                  <span>Bus: {bus.numero_parc}</span><span>Plaque: {bus.plaque_immatriculation}</span>
                </div>
                <div className="grid grid-cols-2 divide-x-4 divide-black">
                  <div className="p-4"><p className="text-[10px] font-black uppercase text-gray-400 mb-3 border-b pb-1 underline">Équipements BOX</p>
                    {inventory.filter(i => i.bus_id === bus.id && i.categorie === 'BOX').map(i => (
                      <div key={i.id} className="flex justify-between text-[11px] py-1 font-bold uppercase"><span>{i.nom}</span><span className="font-mono text-blue-600">{i.numero_serie}</span></div>
                    ))}
                  </div>
                  <div className="p-4 bg-zinc-50"><p className="text-[10px] font-black uppercase text-gray-400 mb-3 border-b pb-1 underline">Surveillance</p>
                    {inventory.filter(i => i.bus_id === bus.id && i.categorie === 'SURVEILLANCE').map(i => (
                      <div key={i.id} className="flex justify-between text-[11px] py-1 font-bold uppercase"><span>{i.nom}</span><span className="font-mono text-orange-600">{i.numero_serie}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* --- GESTION BUS (ADMIN) --- */}
        {view === 'bus' && userRole === 'admin' && (
          <div className="space-y-10">
            <h2 className="text-3xl font-black uppercase border-b-8 border-black inline-block italic">Mise en Service Bus</h2>
            <form onSubmit={handleAjoutCompletBus} className="space-y-6">
              <div className="grid grid-cols-3 gap-4 bg-white p-6 border-4 border-black">
                <input type="text" placeholder="N° PARC" value={numParc} onChange={e => setNumParc(e.target.value)} className="border-2 p-3 font-black uppercase" required />
                <input type="text" placeholder="MODÈLE" value={modeleBus} onChange={e => setModeleBus(e.target.value)} className="border-2 p-3 font-bold uppercase" required />
                <input type="text" placeholder="PLAQUE" value={plaque} onChange={e => setPlaque(e.target.value)} className="border-2 p-3 font-mono uppercase" required />
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div className="bg-white border-4 border-black p-6 shadow-lg"><h3 className="bg-black text-[#ff6600] p-2 font-black uppercase text-center mb-6 text-[10px] italic">Pack BOX</h3>
                  {Object.keys(boxSN).map(k => <input key={k} type="text" placeholder={`S/N ${k.toUpperCase()}`} className="w-full border-2 p-2 mb-2 text-xs font-mono uppercase" onChange={e => setBoxSN({ ...boxSN, [k]: e.target.value })} />)}
                </div>
                <div className="bg-white border-4 border-[#ff6600] p-6 shadow-lg"><h3 className="bg-[#ff6600] text-black p-2 font-black uppercase text-center mb-6 text-[10px] italic">Pack SURVEILLANCE</h3>
                  {Object.keys(survSN).map(k => <input key={k} type="text" placeholder={`S/N ${k.toUpperCase()}`} className="w-full border-2 p-2 mb-2 text-xs font-mono uppercase" onChange={e => setSurvSN({ ...survSN, [k]: e.target.value })} />)}
                </div>
              </div>
              <button type="submit" className="w-full bg-black text-[#ff6600] p-5 font-black uppercase text-xl border-4 border-black shadow-xl hover:bg-[#ff6600] hover:text-black transition-all">Enregistrer l'Installation</button>
            </form>
            <h3 className="text-xl font-black uppercase border-l-8 border-black pl-3 mt-10 italic">Bus Actifs</h3>
            {busList.map(b => (
              <div key={b.id} className="bg-white p-4 border-4 border-black flex justify-between items-center mb-2">
                <span className="font-black text-xl uppercase">{b.numero_parc}</span>
                <button onClick={() => supprimerBus(b.id)} className="bg-red-600 text-white px-6 py-2 rounded font-black text-xs uppercase border-2 border-black hover:bg-black transition-all">Supprimer</button>
              </div>
            ))}
          </div>
        )}

        {/* --- INTERVENTIONS (ADMIN) --- */}
        {view === 'maintenance' && userRole === 'admin' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center border-b-4 border-black pb-2">
              <h2 className="text-3xl font-black uppercase italic text-[#ff6600]">Maintenance</h2>
              <button onClick={() => window.print()} className="bg-black text-[#ff6600] px-4 py-2 font-black text-xs uppercase print:hidden">🖨️ Rapport d'Intervention</button>
            </div>
            <form onSubmit={validerEchange} className="bg-white p-8 border-4 border-black grid grid-cols-2 gap-4 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] print:hidden">
              <select onChange={e => setSelectedBus(e.target.value)} className="col-span-2 border-2 p-3 font-black uppercase" required>
                <option value="">-- Choisir Bus --</option>
                {busList.map(b => <option key={b.id} value={b.id}>{b.numero_parc}</option>)}
              </select>
              <input type="text" placeholder="S/N SORTANT" value={oldSN} onChange={e => setOldSN(e.target.value)} className="p-3 border-2 border-red-200 bg-red-50 font-mono uppercase" required />
              <input type="text" placeholder="S/N ENTRANT" value={newSN} onChange={e => setNewSN(e.target.value)} className="p-3 border-2 border-green-200 bg-green-50 font-mono uppercase" required />
              <textarea placeholder="Raison précise..." value={raison} onChange={e => setRaison(e.target.value)} className="col-span-2 border-2 p-3 h-20 font-bold uppercase" required />
              <button type="submit" className="col-span-2 bg-black text-[#ff6600] p-4 font-black uppercase border-2 border-black">Valider l'Échange</button>
            </form>
            <table className="w-full bg-white border-4 border-black text-[10px]">
              <thead className="bg-black text-white uppercase italic">
                <tr><th className="p-3 text-left">Date & Heure</th><th className="p-3 text-left">Bus</th><th className="p-3 text-left text-red-500">Sortant</th><th className="p-3 text-left text-green-500">Entrant</th><th className="p-3">Raison</th></tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const d = new Date(log.date_intervention);
                  return (
                    <tr key={log.id} className="border-b border-black/10">
                      <td className="p-3 font-bold">{d.toLocaleDateString()}<br /><span className="text-[10px] italic opacity-60">à {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
                      <td className="p-3 font-black text-blue-700">{log.bus?.numero_parc}</td>
                      <td className="p-3 font-mono text-red-600 font-bold">{log.materiel_sortant_sn}</td>
                      <td className="p-3 font-mono text-green-700 font-black">{log.materiel_entrant_sn}</td>
                      <td className="p-3 italic text-gray-500 uppercase">{log.raison_changement}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* --- STOCK (ADMIN) --- */}
        {view === 'stock' && userRole === 'admin' && (
          <div className="space-y-10">
            <h2 className="text-3xl font-black uppercase border-b-8 border-black inline-block italic">Stock & Envois</h2>
            <div className="bg-white p-6 border-4 border-black shadow-md">
              <h3 className="font-black uppercase mb-4 text-[#ff6600] text-xs underline">📥 Réception de matériel</h3>
              <form onSubmit={handleReceptionStock} className="flex gap-3">
                <input type="text" placeholder="Désignation" value={itemName} onChange={e => setItemName(e.target.value)} className="border-2 p-2 flex-1 font-bold uppercase" required />
                <input type="text" placeholder="S/N" value={itemSN} onChange={e => setItemSN(e.target.value)} className="border-2 p-2 flex-1 font-mono uppercase" required />
                <select value={itemCat} onChange={e => setItemCat(e.target.value)} className="border-2 p-2 font-black uppercase text-[10px]"><option value="BOX">BOX</option><option value="SURVEILLANCE">SURVEILLANCE</option></select>
                <button className="bg-black text-white px-6 font-bold uppercase text-[10px]">Entrer en Réserve</button>
              </form>
            </div>
            <div className="grid grid-cols-2 gap-8 items-start h-[500px]">
              <div className="bg-white border-2 border-black overflow-hidden shadow-lg h-full">
                <div className="bg-black text-[#ff6600] p-3 font-black uppercase text-xs">📦 Réserve Khenifra (Quantités)</div>
                <table className="w-full text-xs table-fixed">
                  <thead className="bg-slate-50 border-b-2 border-black font-black uppercase italic text-[10px]"><tr><th className="p-2 text-left">Désignation</th><th className="p-2 text-center w-24">Qté</th></tr></thead>
                  <tbody>
                    {Object.entries(calculerStockRegroupe()).map(([nom, data]) => (
                      <tr key={nom} className="border-b"><td className="p-2 font-bold uppercase truncate">{nom}</td><td className="p-2 text-center font-black text-blue-600">{data.quantite}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-white border-2 border-red-600 overflow-hidden shadow-lg h-full">
                <div className="bg-red-600 text-white p-3 font-black uppercase text-xs flex justify-between items-center h-12"><span>⚠️ Envoi Siège</span><button onClick={validerExpeditionSiege} className="bg-black text-white px-3 py-1 text-[8px] border font-black uppercase">Valider Envoi</button></div>
                <table className="w-full text-[10px] table-fixed">
                  <tbody>
                    {inventory.filter(i => i.en_panne).map(i => (
                      <tr key={i.id} className="border-b border-red-100">
                        <td className="p-2 w-10 text-center"><input type="checkbox" className="accent-red-600" onChange={() => setSelectionEnvoi(prev => prev.includes(i.id) ? prev.filter(x => x !== i.id) : [...prev, i.id])} /></td>
                        <td className="p-2 font-black uppercase truncate">{i.nom}</td><td className="p-2 text-right font-mono truncate">{i.numero_serie}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* HISTORIQUE ENVOIS */}
            <div className="space-y-4">
              <h3 className="font-black uppercase text-lg italic border-l-8 border-orange-600 pl-3">Archives des rapports d'envoi</h3>
              {archivesEnvoi.map(a => (
                <div key={a.id} className="bg-white p-4 border-2 border-black shadow-sm">
                  <p className="font-bold text-[10px] uppercase text-gray-400 italic">Expédié le {new Date(a.date_envoi).toLocaleString()}</p>
                  <p className="font-mono text-[10px] mt-2 border-l-2 border-gray-200 pl-3">{a.liste_materiels}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <button onClick={() => window.print()} className="fixed bottom-8 right-8 bg-black text-[#ff6600] p-5 rounded-full shadow-2xl font-black border-4 border-[#ff6600] print:hidden hover:scale-110 transition uppercase z-50">🖨️</button>
    </div>
  );
}