import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  // --- ÉTATS SYSTÈME ---
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // État pour le menu mobile

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

  const LOGO_URL = "https://karamabus.ma/wp-content/uploads/2024/04/logo-KaramaBus-black.png";

  // --- LOGIQUE AUTHENTIFICATION ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erreur d'accès : " + error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    window.location.href = "/"; 
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

  // --- FONCTIONS ACTIONS ---
  const handleAjoutCompletBus = async (e) => {
    e.preventDefault();
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
    await supabase.from('materiels').update({ en_panne: true, bus_id: null, statut: 'Défectueux' }).eq('numero_serie', oldSN.toUpperCase());
    await supabase.from('materiels').update({ bus_id: selectedBus, statut: 'Installé', en_panne: false }).eq('numero_serie', newSN.toUpperCase());
    await supabase.from('maintenance_logs').insert([{ bus_id: selectedBus, materiel_sortant_sn: oldSN.toUpperCase(), materiel_entrant_sn: newSN.toUpperCase(), raison_changement: raison }]);
    setOldSN(''); setNewSN(''); setRaison(''); fetchData(); alert("Intervention validée");
  };

  const validerExpeditionSiege = async () => {
    if (selectionEnvoi.length === 0) return alert("Sélectionnez des articles !");
    const selection = inventory.filter(i => selectionEnvoi.includes(i.id));
    const liste = selection.map(i => `${i.nom} (S/N: ${i.numero_serie})`).join(', ');
    await supabase.from('rapports_envoi').insert([{ liste_materiels: liste, nb_articles: selectionEnvoi.length }]);
    await supabase.from('materiels').update({ archive_envoi: true, statut: 'Envoyé au Siège' }).in('id', selectionEnvoi);
    setSelectionEnvoi([]); fetchData(); window.print();
  };

  const handleReceptionStock = async (e) => {
    e.preventDefault();
    await supabase.from('materiels').insert([{ nom: itemName.toUpperCase(), numero_serie: itemSN.toUpperCase(), categorie: itemCat, statut: 'En Stock' }]);
    setItemName(''); setItemSN(''); fetchData();
  };

  const supprimerBus = async (id) => {
    if (window.confirm("Supprimer ce bus ?")) {
      await supabase.from('bus').delete().eq('id', id);
      fetchData();
    }
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

  const obtenirDateHeure = () => {
    const maintenant = new Date();
    return maintenant.toLocaleDateString() + ' à ' + maintenant.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // --- RENDU : LOGIN ---
  if (!session && !loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#1a1a1a] p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 border-t-8 border-[#ff6600] w-full max-w-sm shadow-2xl rounded-lg">
          <div className="flex justify-center mb-6"><img src={LOGO_URL} alt="Karamabus" className="h-12" /></div>
          <div className="space-y-4">
            <input type="email" placeholder="Email" className="w-full border-2 p-3 font-bold rounded" onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Mot de passe" className="w-full border-2 p-3 font-bold rounded" onChange={e => setPassword(e.target.value)} required />
            <button className="w-full bg-[#ff6600] text-black font-black p-4 uppercase hover:bg-black hover:text-[#ff6600] transition-all rounded">Accéder</button>
          </div>
        </form>
      </div>
    );
  }

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse">LANCEMENT...</div>;

  // --- RENDU : APPLICATION RESPONSIVE ---
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#f4f4f4] font-sans text-slate-900">
      
      {/* HEADER MOBILE */}
      <header className="lg:hidden bg-[#1a1a1a] text-white p-4 flex justify-between items-center border-b-4 border-[#ff6600] sticky top-0 z-50">
        <img src={LOGO_URL} alt="Logo" className="h-8 bg-white p-1 rounded" />
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-[#ff6600] text-3xl p-2">
          {isMenuOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* BARRE LATÉRALE ADAPTATIVE */}
      <aside className={`${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:sticky top-[68px] lg:top-0 left-0 w-full lg:w-72 bg-[#1a1a1a] text-white h-[calc(100vh-68px)] lg:h-screen transition-transform duration-300 z-40 overflow-y-auto border-r-4 border-[#ff6600] print:hidden`}>
        <div className="hidden lg:flex p-8 bg-white border-b-4 border-[#ff6600] justify-center">
          <img src={LOGO_URL} alt="Logo" className="h-12" />
        </div>
        <nav className="p-4 space-y-2 font-black text-[12px] uppercase">
          {[
            { id: 'dashboard', label: '📊 Situation' },
            { id: 'inventory', label: '📑 Inventaire Bus' },
            { id: 'bus', label: '🚌 Gestion Flotte' },
            { id: 'maintenance', label: '🔧 Interventions' },
            { id: 'stock', label: '📦 Stock & Envois' }
          ].map((item) => (
            <button key={item.id} onClick={() => { setView(item.id); setIsMenuOpen(false); }} className={`w-full text-left p-4 rounded ${view === item.id ? 'bg-[#ff6600] text-black shadow-lg' : 'hover:bg-white/5'}`}>
              {item.label}
            </button>
          ))}
          <button onClick={handleLogout} className="w-full text-left p-4 text-red-500 mt-10 border border-red-900 rounded">🚪 Déconnexion</button>
        </nav>
      </aside>

      {/* CONTENU PRINCIPAL RESPONSIVE */}
      <main className="flex-1 p-4 lg:p-10 overflow-x-hidden">
        <div className="hidden print:flex justify-between items-center border-b-4 border-black mb-8 pb-4">
          <img src={LOGO_URL} alt="Logo" className="h-10" />
          <h1 className="text-xl font-black uppercase italic">Khenifra — Rapport Technique</h1>
          <p className="font-bold text-sm">{obtenirDateHeure()}</p>
        </div>

        {/* --- SITUATION (DASHBOARD) --- */}
        {view === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black border-b-8 border-[#ff6600] inline-block uppercase italic">Situation Technique</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
              <div className="bg-white p-6 border-4 border-black text-center shadow-lg"><p className="text-[10px] font-black text-gray-400 uppercase">Bus Actifs</p><p className="text-4xl lg:text-5xl font-black">{busList.length}</p></div>
              <div className="bg-white p-6 border-4 border-[#ff6600] text-center shadow-lg"><p className="text-[10px] font-black text-[#ff6600] uppercase">Réserve Locale</p><p className="text-4xl lg:text-5xl font-black text-blue-600">{inventory.filter(i => !i.bus_id && !i.en_panne).length}</p></div>
              <div className="bg-black p-6 border-4 border-black text-center text-red-500 shadow-lg"><p className="text-[10px] font-black uppercase">En Panne</p><p className="text-4xl lg:text-5xl font-black">{inventory.filter(i => i.en_panne).length}</p></div>
            </div>
          </div>
        )}

        {/* --- INVENTAIRE --- */}
        {view === 'inventory' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b-8 border-[#ff6600] pb-2">
              <h2 className="text-2xl lg:text-3xl font-black uppercase italic">Inventaire Flotte</h2>
              <button onClick={() => window.print()} className="bg-black text-[#ff6600] px-4 py-2 font-black text-xs uppercase shadow-lg">🖨️ Imprimer</button>
            </div>
            {busList.map(bus => (
              <div key={bus.id} className="bg-white border-4 border-black mb-6 shadow-xl rounded-lg overflow-hidden">
                <div className="bg-black text-[#ff6600] p-4 font-black flex flex-col sm:flex-row justify-between uppercase italic text-xs gap-2">
                  <span>Bus: {bus.numero_parc}</span><span>Plaque: {bus.plaque_immatriculation}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y-4 sm:divide-y-0 sm:divide-x-4 divide-black">
                  <div className="p-4">
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-2 border-b pb-1">Équipements BOX</p>
                    {inventory.filter(i => i.bus_id === bus.id && i.categorie === 'BOX').map(i => (
                      <div key={i.id} className="flex justify-between text-[11px] py-1 font-bold"><span>{i.nom}</span><span className="font-mono text-blue-600">{i.numero_serie}</span></div>
                    ))}
                  </div>
                  <div className="p-4 bg-zinc-50">
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-2 border-b pb-1">Surveillance</p>
                    {inventory.filter(i => i.bus_id === bus.id && i.categorie === 'SURVEILLANCE').map(i => (
                      <div key={i.id} className="flex justify-between text-[11px] py-1 font-bold"><span>{i.nom}</span><span className="font-mono text-orange-600">{i.numero_serie}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* --- GESTION FLOTTE --- */}
        {view === 'bus' && (
          <div className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black border-b-8 border-black inline-block uppercase italic">Mise en Service</h2>
            <form onSubmit={handleAjoutCompletBus} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 lg:p-6 border-4 border-black shadow-lg">
                <input type="text" placeholder="N° PARC" value={numParc} onChange={e => setNumParc(e.target.value)} className="border-2 p-3 font-black uppercase w-full" required />
                <input type="text" placeholder="MODÈLE" value={modeleBus} onChange={e => setModeleBus(e.target.value)} className="border-2 p-3 font-bold uppercase w-full" required />
                <input type="text" placeholder="PLAQUE" value={plaque} onChange={e => setPlaque(e.target.value)} className="border-2 p-3 font-mono uppercase w-full" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border-4 border-black p-4 shadow-lg"><h3 className="bg-black text-[#ff6600] p-2 font-black uppercase text-center mb-4 text-[10px] italic">Pack BOX</h3>
                  {Object.keys(boxSN).map(k => <input key={k} type="text" placeholder={`${k.toUpperCase()}`} className="w-full border-2 p-2 mb-2 text-xs uppercase" onChange={e => setBoxSN({ ...boxSN, [k]: e.target.value })} />)}
                </div>
                <div className="bg-white border-4 border-[#ff6600] p-4 shadow-lg"><h3 className="bg-[#ff6600] text-black p-2 font-black uppercase text-center mb-4 text-[10px] italic">Pack SURVEILLANCE</h3>
                  {Object.keys(survSN).map(k => <input key={k} type="text" placeholder={`${k.toUpperCase()}`} className="w-full border-2 p-2 mb-2 text-xs uppercase" onChange={e => setSurvSN({ ...survSN, [k]: e.target.value })} />)}
                </div>
              </div>
              <button type="submit" className="w-full bg-black text-[#ff6600] p-4 lg:p-5 font-black uppercase text-lg border-4 border-black shadow-xl">Enregistrer Installation</button>
            </form>
            <div className="space-y-2 mt-8">
                {busList.map(b => (
                <div key={b.id} className="bg-white p-4 border-4 border-black flex justify-between items-center shadow-sm">
                  <span className="font-black text-sm uppercase tracking-widest">{b.numero_parc}</span>
                  <button onClick={() => supprimerBus(b.id)} className="bg-red-600 text-white px-4 py-2 font-black text-[10px] uppercase border-2 border-black">Supprimer</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- MAINTENANCE --- */}
        {view === 'maintenance' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black uppercase italic text-[#ff6600] border-b-4 border-black inline-block">Interventions</h2>
            <form onSubmit={validerEchange} className="bg-white p-4 lg:p-8 border-4 border-black grid grid-cols-1 sm:grid-cols-2 gap-4 shadow-lg">
              <select onChange={e => setSelectedBus(e.target.value)} className="sm:col-span-2 border-2 p-3 font-black uppercase bg-slate-50" required>
                <option value="">-- Choisir Bus --</option>
                {busList.map(b => <option key={b.id} value={b.id}>{b.numero_parc}</option>)}
              </select>
              <input type="text" placeholder="S/N DÉFECTUEUX" value={oldSN} onChange={e => setOldSN(e.target.value)} className="p-3 border-2 border-red-200 bg-red-50 font-mono uppercase" required />
              <input type="text" placeholder="S/N ENTRANT" value={newSN} onChange={e => setNewSN(e.target.value)} className="p-3 border-2 border-green-200 bg-green-50 font-mono uppercase" required />
              <textarea placeholder="Motif de la panne..." value={raison} onChange={e => setRaison(e.target.value)} className="sm:col-span-2 border-2 p-3 h-20 font-bold uppercase italic" required />
              <button type="submit" className="sm:col-span-2 bg-black text-[#ff6600] p-4 font-black uppercase border-2 border-black">Valider Échange</button>
            </form>
            <div className="overflow-x-auto shadow-lg">
                <table className="w-full min-w-[700px] bg-white border-4 border-black text-[10px]">
                  <thead className="bg-black text-white uppercase italic">
                    <tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Bus</th><th className="p-3 text-left text-red-500">Sortant</th><th className="p-3 text-left text-green-500">Entrant</th><th className="p-3">Motif</th></tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-b border-black/10">
                        <td className="p-3 font-bold">{new Date(log.date_intervention).toLocaleDateString()}</td>
                        <td className="p-3 font-black text-blue-700 uppercase">{log.bus?.numero_parc}</td>
                        <td className="p-3 font-mono text-red-600">{log.materiel_sortant_sn}</td>
                        <td className="p-3 font-mono text-green-700">{log.materiel_entrant_sn}</td>
                        <td className="p-3 italic text-gray-500 uppercase">{log.raison_changement}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {/* --- STOCK & ENVOIS --- */}
        {view === 'stock' && (
          <div className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black uppercase border-b-8 border-black inline-block italic">Stock & Sorties</h2>
            <div className="bg-white p-4 border-4 border-black shadow-md">
              <h3 className="font-black uppercase mb-4 text-[#ff6600] text-xs underline">📥 Réception Matériel</h3>
              <form onSubmit={handleReceptionStock} className="flex flex-col sm:flex-row gap-3">
                <input type="text" placeholder="Désignation" value={itemName} onChange={e => setItemName(e.target.value)} className="border-2 p-3 flex-1 font-bold uppercase" required />
                <input type="text" placeholder="S/N" value={itemSN} onChange={e => setItemSN(e.target.value)} className="border-2 p-3 flex-1 font-mono uppercase" required />
                <select value={itemCat} onChange={e => setItemCat(e.target.value)} className="border-2 p-3 font-black bg-slate-50 uppercase text-[10px]"><option value="BOX">BOX</option><option value="SURVEILLANCE">SURVEILLANCE</option></select>
                <button className="bg-black text-white px-6 py-3 font-bold uppercase text-[10px]">Ajouter</button>
              </form>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <div className="bg-white border-4 border-black shadow-xl overflow-hidden">
                <div className="bg-black text-[#ff6600] p-3 font-black uppercase text-xs italic">📦 Réserve Khenifra (Qté)</div>
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 border-b-2 border-black font-black uppercase italic text-[10px]"><tr><th className="p-3 text-left">Désignation</th><th className="p-3 text-center w-24">Quantité</th></tr></thead>
                  <tbody>
                    {Object.entries(calculerStockRegroupe()).map(([nom, data]) => (
                      <tr key={nom} className="border-b"><td className="p-3 font-bold uppercase">{nom}</td><td className="p-3 text-center font-black text-blue-600">{data.quantite}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-white border-4 border-red-600 shadow-xl overflow-hidden">
                <div className="bg-red-600 text-white p-3 font-black uppercase text-xs flex justify-between items-center h-14 border-b-2 border-black"><span>⚠️ Envoi au Siège</span><button onClick={validerExpeditionSiege} className="bg-black text-white px-3 py-1 text-[8px] border font-black uppercase">Valider</button></div>
                <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full text-[10px]">
                    <tbody>
                        {inventory.filter(i => i.en_panne).map(i => (
                        <tr key={i.id} className="border-b border-red-100"><td className="p-3 w-10 text-center"><input type="checkbox" className="w-4 h-4" onChange={() => setSelectionEnvoi(prev => prev.includes(i.id) ? prev.filter(x => x !== i.id) : [...prev, i.id])} /></td><td className="p-3 font-black uppercase italic">{i.nom}</td><td className="p-3 text-right font-mono font-bold text-red-500">{i.numero_serie}</td></tr>
                        ))}
                    </tbody>
                    </table>
                </div>
              </div>
            </div>
            <div className="space-y-4 mt-8">
              <h3 className="font-black uppercase text-lg italic border-l-8 border-orange-600 pl-3">Archives Envois</h3>
              {archivesEnvoi.map(a => (
                <div key={a.id} className="bg-white p-4 border-2 border-black shadow-md italic">
                  <p className="font-bold text-[10px] uppercase text-gray-400">Rapport du {new Date(a.date_envoi).toLocaleString()}</p>
                  <p className="font-mono text-[10px] mt-2 border-l-4 border-gray-100 pl-3 leading-relaxed">{a.liste_materiels}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      
      {/* BOUTON IMPRIMER MOBILE */}
      <button onClick={() => window.print()} className="fixed bottom-6 right-6 lg:bottom-10 lg:right-10 bg-black text-[#ff6600] p-4 lg:p-6 rounded-full shadow-2xl font-black border-4 border-[#ff6600] print:hidden z-50">🖨️</button>
    </div>
  );
}