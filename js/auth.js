//====================
//Authentification (Supabase)
//====================

//⚠️ À REMPLACER : va dans ton projet Supabase > Settings > API pour récupérer ces valeurs.
//Ce sont des clés PUBLIQUES faites pour être dans le code du site/app — la vraie
//sécurité est assurée par les policies RLS qu'on a mises en place en base de
//données, pas en cachant cette clé. Pas de souci à ce qu'elle soit visible.
    const SUPABASE_URL = "https://jbcoatxrjavrrqiwrpwu.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_sh1HjB_jA0VrFOg1d_k4pg_ztOkhaKM";

    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,   // garde la session dans le navigateur (localStorage)
            autoRefreshToken: true, // renouvelle automatiquement le token avant expiration
            detectSessionInUrl: true,
        },
    });

//Infos du joueur connecté, utilisées par sync.js pour savoir "qui capture quoi"
    let currentUserId = null;
    let currentUsername = null;

//Mode courant du formulaire : "login" ou "signup"
    let authMode = "login";

//====================
//Initialisation : vérifie si une session existe déjà
//====================
    async function initAuth() {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            // Déjà connecté (session sauvegardée par le navigateur) : on saute l'écran de connexion
            const username = await fetchUsername(session.user.id);
            currentUserId = session.user.id;
            currentUsername = username;
            hideAuthScreen();
            startGameAfterAuth(username);
        } else {
            showAuthScreen();
        }

        setupAuthFormListeners();
    }

//Récupère le pseudo depuis la table profiles
    async function fetchUsername(userId) {
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .single();

        if (error || !data) return null;
        return data.username;
    }

//====================
//Affichage / masquage de l'écran de connexion
//====================
    function showAuthScreen() {
        document.getElementById("authScreen").style.display = "flex";
    }
    function hideAuthScreen() {
        document.getElementById("authScreen").style.display = "none";
    }

    function showAuthError(message) {
        const el = document.getElementById("authError");
        el.textContent = message;
        el.style.display = "block";
    }
    function clearAuthError() {
        const el = document.getElementById("authError");
        el.textContent = "";
        el.style.display = "none";
    }

//Bascule entre "Connexion" et "Créer un compte"
    function switchAuthMode() {
        authMode = authMode === "login" ? "signup" : "login";
        clearAuthError();

        const usernameField = document.getElementById("authUsername");
        const submitBtn = document.getElementById("authSubmitBtn");
        const switchText = document.getElementById("authSwitchText");

        if (authMode === "signup") {
            usernameField.style.display = "block";
            submitBtn.textContent = "Créer mon compte";
            switchText.innerHTML = 'Déjà un compte ? <span id="authSwitchLink">Se connecter</span>';
        } else {
            usernameField.style.display = "none";
            submitBtn.textContent = "Connexion";
            switchText.innerHTML = 'Pas encore de compte ? <span id="authSwitchLink">Créer un compte</span>';
        }

        // Le lien a été recréé dans le innerHTML, il faut réattacher son événement
        document.getElementById("authSwitchLink").addEventListener("click", switchAuthMode);
    }

//====================
//Soumission du formulaire
//====================
    async function handleAuthSubmit() {
        clearAuthError();

        const email = document.getElementById("authEmail").value.trim();
        const password = document.getElementById("authPassword").value;
        const username = document.getElementById("authUsername").value.trim();

        if (!email || !password) {
            showAuthError("Email et mot de passe requis.");
            return;
        }

        const submitBtn = document.getElementById("authSubmitBtn");
        submitBtn.disabled = true;
        submitBtn.textContent = "…";

        if (authMode === "signup") {
            await handleSignUp(email, password, username);
        } else {
            await handleLogin(email, password);
        }

        submitBtn.disabled = false;
        submitBtn.textContent = authMode === "signup" ? "Créer mon compte" : "Connexion";
    }

    async function handleSignUp(email, password, username) {
        if (!username) {
            showAuthError("Choisis un pseudo.");
            return;
        }

        const { data, error } = await supabaseClient.auth.signUp({ email, password });

        if (error) {
            showAuthError(traduireErreur(error.message));
            return;
        }

        // Si la confirmation par email est activée dans Supabase, data.session sera null ici
        if (!data.session) {
            showAuthError("Compte créé ! Vérifie tes emails pour confirmer, puis connecte-toi.");
            switchAuthMode();
            return;
        }

        // Crée la ligne profil associée (username, score de départ)
        await supabaseClient.from("profiles").insert({
            id: data.user.id,
            username: username,
        });

        currentUserId = data.user.id;
        currentUsername = username;

        hideAuthScreen();
        startGameAfterAuth(username);
    }

    async function handleLogin(email, password) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            showAuthError(traduireErreur(error.message));
            return;
        }

        const username = await fetchUsername(data.user.id);
        currentUserId = data.user.id;
        currentUsername = username;

        hideAuthScreen();
        startGameAfterAuth(username);
    }

//Traduit les messages d'erreur Supabase les plus courants en français
    function traduireErreur(message) {
        if (message.includes("Invalid login credentials")) return "Email ou mot de passe incorrect.";
        if (message.includes("User already registered")) return "Un compte existe déjà avec cet email.";
        if (message.includes("Password should be at least")) return "Le mot de passe doit faire au moins 6 caractères.";
        return message;
    }

//====================
//Écouteurs d'événements du formulaire
//====================
    function setupAuthFormListeners() {
        document.getElementById("authSubmitBtn").addEventListener("click", handleAuthSubmit);
        document.getElementById("authSwitchLink").addEventListener("click", switchAuthMode);

        // Permet de valider avec la touche Entrée
        document.getElementById("authPassword").addEventListener("keydown", (e) => {
            if (e.key === "Enter") handleAuthSubmit();
        });
    }
