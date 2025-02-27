const modulename = 'ConfigVault';
import fs from 'node:fs';
import { cloneDeep }  from 'lodash-es';
import logger from '@core/extras/console.js';
import { verbose } from '@core/globalData';
const { dir, log, logOk, logWarn, logError } = logger(modulename);

//Helper functions
const isUndefined = (x) => { return (typeof x === 'undefined'); };
const toDefault = (input, defVal) => { return (isUndefined(input)) ? defVal : input; };
const removeNulls = (obj) => {
    const isArray = obj instanceof Array;
    for (let k in obj) {
        if (obj[k] === null) isArray ? obj.splice(k, 1) : delete obj[k];
        else if (typeof obj[k] == 'object') removeNulls(obj[k]);
        if (isArray && obj.length == k) removeNulls(obj);
    }
    return obj;
};
const deepFreeze = (obj) => {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(function (prop) {
        if (obj.hasOwnProperty(prop)
            && obj[prop] !== null
            && (typeof obj[prop] === 'object' || typeof obj[prop] === 'function')
            && !Object.isFrozen(obj[prop])
        ) {
            deepFreeze(obj[prop]);
        }
    });
    return obj;
};

export default class ConfigVault {
    constructor(profilePath, serverProfile) {
        this.serverProfile = serverProfile;
        this.serverProfilePath = profilePath;
        this.configFilePath = `${this.serverProfilePath}/config.json`;
        this.configFile = null;
        this.config = null;

        this.setupVault();
    }


    //================================================================
    /**
     * Setup Vault
     */
    setupVault() {
        try {
            let cfgData = this.getConfigFromFile();
            this.configFile = this.setupConfigStructure(cfgData);
            this.config = this.setupConfigDefaults(this.configFile);
            this.setupFolderStructure();
        } catch (error) {
            logError(error.message);
            process.exit(0);
        }
    }


    //================================================================
    /**
     * Returns the config file data
     */
    getConfigFromFile() {
        //Try to load config file
        //TODO: create a lock file to prevent starting twice the same config file?
        let rawFile = null;
        try {
            rawFile = fs.readFileSync(this.configFilePath, 'utf8');
        } catch (error) {
            throw new Error(`Unable to load configuration file '${this.configFilePath}'. (cannot read file, please read the documentation)\nOriginal error: ${error.message}`);
        }

        //Try to parse config file
        let cfgData = null;
        try {
            cfgData = JSON.parse(rawFile);
        } catch (error) {
            if (rawFile.includes('\\')) logError(`Note: your 'txData/${this.serverProfile}/config.json' file contains '\\', make sure all your paths use only '/'.`);
            throw new Error(`Unable to load configuration file '${this.configFilePath}'. \nOriginal error: ${error.message}`);
        }

        return cfgData;
    }


    //================================================================
    /**
     * ????????????
     * @param {object} cfgData
     */
    setupConfigStructure(cfgData) {
        let cfg = cloneDeep(cfgData);
        let out = {
            global: null,
            logger: null,
            monitor: null,
            playerDatabase: null,
            webServer: null,
            discordBot: null,
            fxRunner: null,
        };

        //NOTE: this shit is ugly, but I wont bother fixing it.
        //      this entire config vault is stupid.
        //      use convict, lodash defaults or something like that
        cfg.playerDatabase = cfg.playerDatabase ?? cfg.playerController ?? {};

        try {
            out.global = {
                serverName: toDefault(cfg.global.serverName, null),
                language: toDefault(cfg.global.language, null),
                menuEnabled: toDefault(cfg.global.menuEnabled, true),
                menuAlignRight: toDefault(cfg.global.menuAlignRight, false),
                menuPageKey: toDefault(cfg.global.menuPageKey, 'Tab'),
            };
            out.logger = toDefault(cfg.logger, {}); //not in template
            out.monitor = {
                restarterSchedule: toDefault(cfg.monitor.restarterSchedule, []),
                cooldown: toDefault(cfg.monitor.cooldown, null), //not in template
                resourceStartingTolerance: toDefault(cfg.monitor.resourceStartingTolerance, 120), //not in template
                disableChatWarnings: toDefault(cfg.monitor.disableChatWarnings, null), //not in template
            };
            out.playerDatabase = {
                onJoinCheckBan: toDefault(cfg.playerDatabase.onJoinCheckBan, true),
                onJoinCheckWhitelist: toDefault(cfg.playerDatabase.onJoinCheckWhitelist, false),
                onJoinCheckDiscordWhitelist: toDefault(cfg.playerDatabase.onJoinCheckDiscordWhitelist, false),
                discordWhiteListRoles: toDefault(cfg.playerDatabase.discordWhiteListRoles, false),
                whitelistRejectionMessage: toDefault(
                    cfg.playerDatabase.whitelistRejectionMessage,
                    'Please join http://discord.gg/example and request to be whitelisted.',
                ),
                banRejectionMessage: toDefault(
                    cfg.playerDatabase.banRejectionMessage,
                    'You can join http://discord.gg/example to appeal this ban.',
                ),
            };
            out.webServer = {
                disableNuiSourceCheck: toDefault(cfg.webServer.disableNuiSourceCheck, false), //not in template
                limiterMinutes: toDefault(cfg.webServer.limiterMinutes, null), //not in template
                limiterAttempts: toDefault(cfg.webServer.limiterAttempts, null), //not in template
            };
            out.discordBot = {
                enabled: toDefault(cfg.discordBot.enabled, null),
                token: toDefault(cfg.discordBot.token, null),
                announceChannel: toDefault(cfg.discordBot.announceChannel, null),
                prefix: toDefault(cfg.discordBot.prefix, '!'),
                statusMessage: toDefault(
                    cfg.discordBot.statusMessage,
                    '**IP:** `change-me:<port>`\n**Players:** <players>\n**Uptime:** <uptime>',
                ),
                commandCooldown: toDefault(cfg.discordBot.commandCooldown, null), //not in template
            };
            out.fxRunner = {
                serverDataPath: toDefault(cfg.fxRunner.serverDataPath, null),
                cfgPath: toDefault(cfg.fxRunner.cfgPath, null),
                commandLine: toDefault(cfg.fxRunner.commandLine, null),
                logPath: toDefault(cfg.fxRunner.logPath, null), //not in template
                onesync: toDefault(cfg.fxRunner.onesync, null),
                autostart: toDefault(cfg.fxRunner.autostart, null),
                restartDelay: toDefault(cfg.fxRunner.restartDelay, null), //not in template
                quiet: toDefault(cfg.fxRunner.quiet, null),
            };

            //Migrations
            //Removing menu beta convar (v4.9)
            out.fxRunner.commandLine = out.fxRunner.commandLine?.replace(/\+?setr? txEnableMenuBeta true\s?/gi, '');

            //Merging portuguese
            if (out.global.language === 'pt_PT' || out.global.language === 'pt_BR') {
                out.global.language = 'pt';
            }
        } catch (error) {
            if (verbose) dir(error);
            throw new Error(`Malformed configuration file! Make sure your txAdmin is updated!\nOriginal error: ${error.message}`);
        }

        return out;
    }


    //================================================================
    /**
     * Setup the this.config variable based on the config file data
     * FIXME: rename this function
     * @param {object} cfgData
     */
    setupConfigDefaults(cfgData) {
        let cfg = cloneDeep(cfgData);
        //NOTE: the bool trick in fxRunner.autostart won't work if we want the default to be true
        try {
            //Global
            cfg.global.serverName = cfg.global.serverName || 'change-me';
            cfg.global.language = cfg.global.language || 'en'; //TODO: move to GlobalData
            cfg.global.menuEnabled = (cfg.global.menuEnabled === 'true' || cfg.global.menuEnabled === true);
            cfg.global.menuAlignRight = (cfg.global.menuAlignRight === 'true' || cfg.global.menuAlignRight === true);
            cfg.global.menuPageKey = cfg.global.menuPageKey || 'Tab';

            //Logger - NOTE: this one default's i'm doing directly into the class
            cfg.logger.fxserver = toDefault(cfg.logger.fxserver, {});
            cfg.logger.server = toDefault(cfg.logger.server, {});
            cfg.logger.admin = toDefault(cfg.logger.admin, {});
            cfg.logger.console = toDefault(cfg.logger.console, {});

            //Monitor
            cfg.monitor.restarterSchedule = cfg.monitor.restarterSchedule || [];
            cfg.monitor.cooldown = parseInt(cfg.monitor.cooldown) || 60; //not in template - 45 > 60 > 90 -> 60 after fixing the "extra time" logic
            cfg.monitor.resourceStartingTolerance = parseInt(cfg.monitor.resourceStartingTolerance) || 120;
            cfg.monitor.disableChatWarnings = (cfg.monitor.disableChatWarnings === 'true' || cfg.monitor.disableChatWarnings === true);

            //Player Controller
            cfg.playerDatabase.onJoinCheckBan = (cfg.playerDatabase.onJoinCheckBan === null)
                ? true
                : (cfg.playerDatabase.onJoinCheckBan === 'true' || cfg.playerDatabase.onJoinCheckBan === true);
            cfg.playerDatabase.onJoinCheckWhitelist = (cfg.playerDatabase.onJoinCheckWhitelist === null)
                ? false
                : (cfg.playerDatabase.onJoinCheckWhitelist === 'true' || cfg.playerDatabase.onJoinCheckWhitelist === true);
            cfg.playerDatabase.whitelistRejectionMessage = cfg.playerDatabase.whitelistRejectionMessage || '';
            cfg.playerDatabase.banRejectionMessage = cfg.playerDatabase.banRejectionMessage || '';

            //WebServer
            cfg.webServer.disableNuiSourceCheck = (cfg.webServer.disableNuiSourceCheck === 'true' || cfg.webServer.disableNuiSourceCheck === true);
            cfg.webServer.limiterMinutes = parseInt(cfg.webServer.limiterMinutes) || 15; //not in template
            cfg.webServer.limiterAttempts = parseInt(cfg.webServer.limiterAttempts) || 10; //not in template

            //DiscordBot
            cfg.discordBot.enabled = (cfg.discordBot.enabled === 'true' || cfg.discordBot.enabled === true);
            cfg.discordBot.prefix = cfg.discordBot.prefix || '!';
            cfg.discordBot.statusMessage = cfg.discordBot.statusMessage || '**Join:** `change-me:<port>`\n**Players:** <players>\n**Uptime:** <uptime>';
            cfg.discordBot.commandCooldown = parseInt(cfg.discordBot.commandCooldown) || 30; //not in template

            //FXRunner
            cfg.fxRunner.logPath = cfg.fxRunner.logPath || `${this.serverProfilePath}/logs/fxserver.log`; //not in template
            cfg.fxRunner.autostart = (cfg.fxRunner.autostart === 'true' || cfg.fxRunner.autostart === true);
            cfg.fxRunner.restartDelay = parseInt(cfg.fxRunner.restartDelay) || 1250; //not in template
            cfg.fxRunner.quiet = (cfg.fxRunner.quiet === 'true' || cfg.fxRunner.quiet === true);
        } catch (error) {
            if (verbose) dir(error);
            throw new Error(`Malformed configuration file! Make sure your txAdmin is updated.\nOriginal error: ${error.message}`);
        }

        return cfg;
    }


    //================================================================
    /**
     * Create server profile folder structure if doesn't exist
     */
    setupFolderStructure() {
        try {
            let dataPath = `${this.serverProfilePath}/data/`;
            if (!fs.existsSync(dataPath)) {
                fs.mkdirSync(dataPath);
            }

            let logsPath = `${this.serverProfilePath}/logs/`;
            if (!fs.existsSync(logsPath)) {
                fs.mkdirSync(logsPath);
            }
        } catch (error) {
            logError(`Failed to set up folder structure in '${this.serverProfilePath}/' with error: ${error.message}`);
            process.exit();
        }
    }


    //================================================================
    /**
     * Return configs for a specific scope (reconstructed and freezed)
     */
    getScoped(scope) {
        return cloneDeep(this.config[scope]);
    }

    //================================================================
    /**
     * Return configs for a specific scope (reconstructed and freezed)
     */
    getScopedStructure(scope) {
        return cloneDeep(this.configFile[scope]);
    }


    //================================================================
    /**
     * Return all configs individually reconstructed and freezed
     */
    getAll() {
        let cfg = cloneDeep(this.config);
        return deepFreeze({
            global: cfg.global,
            logger: cfg.logger,
            monitor: cfg.monitor,
            playerDatabase: cfg.playerDatabase,
            webServer: cfg.webServer,
            discordBot: cfg.discordBot,
            fxRunner: cfg.fxRunner,
        });
    }


    //================================================================
    /**
     * Save the new scope to this context, then saves it to the configFile
     * @param {string} scope
     * @param {string} newConfig
     */
    saveProfile(scope, newConfig) {
        try {
            let toSave = cloneDeep(this.configFile);
            toSave[scope] = newConfig;
            toSave = removeNulls(toSave);
            fs.writeFileSync(this.configFilePath, JSON.stringify(toSave, null, 2), 'utf8');
            this.configFile = toSave;
            this.config = this.setupConfigDefaults(this.configFile);
            return true;
        } catch (error) {
            dir(error);
            return false;
        }
    }
};
