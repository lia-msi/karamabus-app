import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  // --- ÉTATS SYSTÈME ---
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Pour le menu mobile

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
    setOldSN(''); setNewSN(''); setRaison(''); fetchData();
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

  // --- LOGIN MOBILE ---
  if (!session && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a] p-4">
        <form onSubmit={handleLogin} className="bg-white p-6 sm:p-10 border-t-8 border-[#ff6600] w-full max-w-sm shadow-2xl rounded-lg">
          <div className="flex justify-center mb-6">
            <img src={LOGO_URL} alt="Karamabus" className="h-12 sm:h-16" />
          </div>
          <div className="space-y-4">
            <input type="email" placeholder="Email" className="w-full border-2 p-3 font-bold rounded" onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Mot de passe" className="w-full border-2 p-3 font-bold rounded" onChange={e => setPassword(e.target.value)} required />
            <button className="w-full bg-[#ff6600] text-black font-black p-4 uppercase rounded hover:bg-black hover:text-white transition-all">Accéder</button>
          </div>
        </form>
      </div>
    );
  }

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse uppercase">Chargement...</div>;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#f4f4f4] font-sans text-slate-900">
      
      {/* --- MENU MOBILE (HEADER) --- */}
      <header className="lg:hidden bg-[#1a1a1a] text-white p-4 flex justify-between items-center border-b-4 border-[#ff6600] sticky top-0 z-50">
        <img src={LOGO_URL} alt="Logo" className="h-8 bg-white p-1 rounded" />
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-[#ff6600] text-2xl">
          {isMenuOpen ? '✖' : '☰'}
        </button>
      </header>

      {/* --- ASIDE (MOBILE & DESKTOP) --- */}
      <aside className={`${isMenuOpen ? 'block' : 'hidden'} lg:block w-full lg:w-72 bg-[#1a1a1a] text-white flex flex-col border-r-4 border-[#ff6600] print:hidden fixed lg:sticky top-[64px] lg:top-0 h-[calc(100vh-64px)] lg:h-screen z-40 transition-all`}>
        <div className="hidden lg:flex p-8 bg-white border-b-4 border-[#ff6600] justify-center">
          <img src={LOGO_URL} alt="Logo" className="h-12" />
        </div>
        <nav className="flex-1 px-4 py-6 space-y-3 font-black text-[11px] uppercase overflow-y-auto">
          {['dashboard', 'inventory', 'bus', 'maintenance', 'stock'].map((v) => (
            <button key={v} onClick={() => { setView(v); setIsMenuOpen(false); }} className={`w-full text-left p-4 rounded ${view === v ? 'bg-[#ff6600] text-black shadow-lg' : 'hover:bg-white/5'}`}>
              {v === 'dashboard' && '📊 Situation'}
              {v === 'inventory' && '📑 Inventaire Bus'}
              {v === 'bus' && '🚌 Gestion Flotte'}
              {v === 'maintenance' && '🔧 Interventions'}
              {v === 'stock' && '📦 Stock & Envois'}
            </button>
          ))}
          <button onClick={handleLogout} className="w-full text-left p-4 text-red-500 mt-10 border border-red-900 rounded">🚪 Déconnexion</button>
        </nav>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 p-4 lg:p-10 overflow-x-hidden">
        
        {/* DASHBOARD RESPONSIVE */}
        {view === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black border-b-8 border-[#ff6600] inline-block uppercase italic">Situation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-6 border-4 border-black text-center shadow-lg"><p className="text-[10px] font-black text-gray-400 uppercase">Bus</p><p className="text-4xl lg:text-5xl font-black">{busList.length}</p></div>
              <div className="bg-white p-6 border-4 border-[#ff6600] text-center shadow-lg"><p className="text-[10px] font-black text-[#ff6600] uppercase">Réserve</p><p className="text-4xl lg:text-5xl font-black text-blue-600">{inventory.filter(i => !i.bus_id && !i.en_panne).length}</p></div>
              <div className="bg-black p-6 border-4 border-black text-center text-red-500 shadow-lg"><p className="text-[10px] font-black uppercase">Pannes</p><p className="text-4xl lg:text-5xl font-black">{inventory.filter(i => i.en_panne).length}</p></div>
            </div>
          </div>
        )}

        {/* INVENTAIRE RESPONSIVE */}
        {view === 'inventory' && (
          <div className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black border-b-8 border-[#ff6600] inline-block uppercase italic">État Flotte</h2>
            {busList.map(bus => (
              <div key={bus.id} className="bg-white border-4 border-black mb-6 shadow-xl rounded-lg overflow-hidden">
                <div className="bg-black text-[#ff6600] p-4 font-black flex flex-col sm:flex-row justify-between uppercase italic text-xs gap-2">
                  <span>Bus: {bus.numero_parc}</span><span>Plaque: {bus.plaque_immatriculation}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y-4 sm:divide-y-0 sm:divide-x-4 divide-black">
                  <div className="p-4">
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-2 underline">BOX</p>
                    {inventory.filter(i => i.bus_id === bus.id && i.categorie === 'BOX').map(i => (
                      <div key={i.id} className="flex justify-between text-[11px] py-1 font-bold"><span>{i.nom}</span><span className="font-mono text-blue-600">{i.numero_serie}</span></div>
                    ))}
                  </div>
                  <div className="p-4 bg-zinc-50">
                    <p className="text-[10px] font-black uppercase text-gray-400 mb-2 underline">Surveillance</p>
                    {inventory.filter(i => i.bus_id === bus.id && i.categorie === 'SURVEILLANCE').map(i => (
                      <div key={i.id} className="flex justify-between text-[11px] py-1 font-bold"><span>{i.nom}</span><span className="font-mono text-orange-600">{i.numero_serie}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* GESTION BUS RESPONSIVE */}
        {view === 'bus' && (
          <div className="space-y-6">
            <h2 className="text-2xl lg:text-3xl font-black border-b-8 border-black inline-block uppercase italic">Nouveau Bus</h2>
            <form onSubmit={handleAjoutCompletBus} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 bg-white p-4 border-4 border-black shadow-lg">
                <input type="text" placeholder="N° PARC" value={numParc} onChange={e => setNumParc(e.target.value)} className="border-2 p-3 font-black uppercase w-full" required />
                <input type="text" placeholder="MODÈLE" value={modeleBus} onChange={e => setModeleBus(e.target.value)} className="border-2 p-3 font-bold uppercase w-full" required />
                <input type="text" placeholder="PLAQUE" value={plaque} onChange={e => setPlaque(e.target.value)} className="border-2 p-3 font-mono uppercase w-full" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border-4 border-black p-4 shadow-lg"><h3 className="bg-black text-[#ff6600] p-2 font-black uppercase text-center mb-4 text-[10px]">BOX</h3>
                  {Object.keys(boxSN).map(k => <input key={k} type="text" placeholder={`${k.toUpperCase()}`} className="w-full border-2 p-2 mb-2 text-xs uppercase" onChange={e => setBoxSN({ ...boxSN, [k]: e.target.value })} />)}
                </div>
                <div className="bg-white border-4 border-[#ff6600] p-4 shadow-lg"><h3 className="bg-[#ff6600] text-black p-2 font-black uppercase text-center mb-4 text-[10px]">Surveillance</h3>
                  {Object.keys(survSN).map(k => <input key={k} type="text" placeholder={`${k.toUpperCase()}`} className="w-full border-2 p-2 mb-2 text-xs uppercase" onChange={e => setSurvSN({ ...survSN, [k]: e.target.value })} />)}
                </div>
              </div>
              <button type="submit" className="w-full bg-black text-[#ff6600] p-4 font-black uppercase shadow-xl border-4 border-black">Installer Bus</button>
            </form>
          </div>
        )}

        {/* MAINTENANCE RESPONSIVE */}
        {view === 'maintenance' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black uppercase italic text-[#ff6600] border-b-4 border-black inline-block">Interventions</h2>
            <form onSubmit={validerEchange} className="bg-white p-4 lg:p-8 border-4 border-black grid grid-cols-1 sm:grid-cols-2 gap-4 shadow-lg">
              <select onChange={e => setSelectedBus(e.target.value)} className="sm:col-span-2 border-2 p-3 font-black uppercase" required>
                <option value="">-- Choisir Bus --</option>
                {busList.map(b => <option key={b.id} value={b.id}>{b.numero_parc}</option>)}
              </select>
              <input type="text" placeholder="S/N SORTANT" value={oldSN} onChange={e => setOldSN(e.target.value)} className="p-3 border-2 border-red-200 bg-red-50 font-mono uppercase" required />
              <input type="text" placeholder="S/N ENTRANT" value={newSN} onChange={e => setNewSN(e.target.value)} className="p-3 border-2 border-green-200 bg-green-50 font-mono uppercase" required />
              <textarea placeholder="Raison..." value={raison} onChange={e => setRaison(e.target.value)} className="sm:col-span-2 border-2 p-3 h-20 font-bold uppercase italic" required />
              <button type="submit" className="sm:col-span-2 bg-black text-[#ff6600] p-4 font-black uppercase border-2 border-black">Valider</button>
            </form>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] bg-white border-4 border-black text-[10px]">
                    <thead className="bg-black text-white uppercase italic">
                        <tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Bus</th><th className="p-2 text-left text-red-500">Sortant</th><th className="p-2 text-left text-green-500">Entrant</th></tr>
                    </thead>
                    <tbody>
                        {logs.map(log => (
                        <tr key={log.id} className="border-b border-black/10">
                            <td className="p-2 font-bold">{new Date(log.date_intervention).toLocaleDateString()}</td>
                            <td className="p-2 font-black text-blue-700">{log.bus?.numero_parc}</td>
                            <td className="p-2 font-mono text-red-600">{log.materiel_sortant_sn}</td>
                            <td className="p-2 font-mono text-green-700">{log.materiel_entrant_sn}</td>
                        </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
        )}

      </main>
      
      {/* BOUTON IMPRIMER MOBILE */}
      <button onClick={() => window.print()} className="fixed bottom-6 right-6 bg-black text-[#ff6600] p-4 rounded-full shadow-2xl font-black border-4 border-[#ff6600] print:hidden z-50">🖨️</button>
    </div>
  );
}