const vscode = require('vscode');
const simpleGit = require('simple-git');
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const util = require('util');
const exec = util.promisify(cp.exec);

module.exports = class gitTracker {
    constructor(currentDir) {
        this._currentDir = currentDir;
        this._initialWorkspaceDir = currentDir;
        this.git = null;
        this.codeHistoriesGit = null;
        this.isUsingCodeHistoriesGit = true;
        this.initGitingore();
    }

    timestamp() {
        var time = Date.now || function() {
            return +new Date;
        };
        return time();
    }

    initGitingore() {
        let itemsToAdd = ['codeHistories.git', '.vscode', 'venv', 'node_modules', '.bash_profile', 'screencaptures'];
        let gitignorePath = this._currentDir + '/.gitignore';

        let data = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
        itemsToAdd.forEach(item => {
            if (!data.includes(item)) {
                fs.appendFileSync(gitignorePath, `${item}\n`);
            }
        });
    }

    listGitRepos() {
        var gitReposInCurrentDir = ['./.git'];
        if(process.platform === 'win32') {
            gitReposInCurrentDir = cp.execSync('Get-ChildItem . -Attributes Directory,Hidden -ErrorAction SilentlyContinue -Filter *.git -Recurse | % { Write-Host $_.FullName }', {cwd: this._initialWorkspaceDir, shell: "PowerShell"});
        }
        else if(process.platform === 'darwin' || process.platform === 'linux') {
            gitReposInCurrentDir = cp.execSync('find ~+ -type d -name "*.git"', {cwd: this._initialWorkspaceDir, shell: "bash"});
        }

        // console.log(gitRepoInCurrentDir.toString());
        // get individual lines of output
        var gitRepos = gitReposInCurrentDir.toString().split('\n');

        // eliminate empty lines
        gitRepos = gitRepos.filter(function (el) {
            return el != "";
        });

        // make first letter of each line lowercase
        gitRepos = gitRepos.map(function (el) {
            return el.charAt(0).toLowerCase() + el.slice(1);
        });

        console.log(gitRepos);
        return gitRepos;
    }

    presentGitRepos() {
        var gitRepos = this.listGitRepos();
        if(gitRepos.length > 0) {
            var items = [];

            if(this.isUsingCodeHistoriesGit){
                // if current directory is in gitRepos, add it to the top of the list
                if(gitRepos.includes(this._currentDir + '\\codeHistories.git')){
                    items.push({ label: this._currentDir + '\\codeHistories.git', description: "Current repo" });
                } else if(gitRepos.includes(this._currentDir + '/codeHistories.git')){
                    items.push({ label: this._currentDir + '/codeHistories.git', description: "Current repo" });
                }
                // add all other git repos to the list
                for(var i = 0; i < gitRepos.length; i++) {
                    if(gitRepos[i] != this._currentDir + '\\codeHistories.git' && gitRepos[i] != this._currentDir + '/codeHistories.git') {
                        items.push({ label: gitRepos[i].toString(), description: '' });
                    }
                }
            } else {
                if(gitRepos.includes(this._currentDir + '\\.git')){
                    items.push({ label: this._currentDir + '\\.git', description: "Current repo" });
                } else if(gitRepos.includes(this._currentDir + '/.git')){
                    items.push({ label: this._currentDir + '/.git', description: "Current repo" });
                }
                for(var i = 0; i < gitRepos.length; i++) {
                    if(gitRepos[i] != this._currentDir + '\\.git' && gitRepos[i] != this._currentDir + '/.git') {
                        items.push({ label: gitRepos[i].toString(), description: '' });
                    }
                }
            }

            vscode.window.showQuickPick(items, {
                canPickMany: false, 
                placeHolder: 'Select a git repo to track', 
                ignoreFocusOut: true,
                matchOnDescription: true,
                matchOnDetail: true,
            }).then((selectedRepo) => {
                if(selectedRepo) {
                    this._currentDir = path.join(selectedRepo.label,'../');
                    // omit last \\ or / from path
                    this._currentDir = this._currentDir.substring(0, this._currentDir.length - 1);
                    if(selectedRepo.label.includes('codeHistories.git')) {
                        this.isUsingCodeHistoriesGit = true;
                    } else {
                        this.isUsingCodeHistoriesGit = false;
                    }
                    this.initGitingore();
                    this.createGitFolders();
                }
            });
        }
    }

    initializeGit(git){
        console.log("Initializing git...");
        return git.init();
    }

    isGitInitialized(git) {
        return git.checkIsRepo()
            .then(isRepo => !isRepo && this.initializeGit(git))
            .then(() => {
                git.fetch().then((success) => {
                    console.log("Fetched");
                }
                , (failure) => {
                    console.log(failure);
                    console.log("Failed to fetch");
                });
            });
    }

    checkGitFolders() {
        if(!fs.existsSync(this._currentDir + '/.git') && !fs.existsSync(this._currentDir + '/codeHistories.git')){
            return "case 1"
        }
        if(!fs.existsSync(this._currentDir + '/.git') && fs.existsSync(this._currentDir + '/codeHistories.git')){
            return "case 2"
        }
        if(fs.existsSync(this._currentDir + '/.git') && !fs.existsSync(this._currentDir + '/codeHistories.git')){
            return "case 3"
        }
        if(fs.existsSync(this._currentDir + '/.git') && fs.existsSync(this._currentDir + '/codeHistories.git')){
            return "case 4"
        }
    }

    // case 1: both .git and codeHistories.git folders do not exist
    // case 2: .git folder does not exist
    // case 3: codeHistories.git folder does not exist
    // case 4: both .git and codeHistories.git folders exist
    createGitFolders() {
        switch(this.checkGitFolders()) {
            case "case 1":
                vscode.window.showInformationMessage('No git repos found in this workspace. Initializing .git and codeHistories.git (default). Use Ctrl+Shift+G to switch to .git if needed.');
                console.log("both .git and codeHistories.git folders do not exist");
                this.git = simpleGit(this._currentDir);
                this.isGitInitialized(this.git);
                this.codeHistoriesGit = simpleGit(this._currentDir).env({ 'GIT_DIR': this._currentDir + '/codeHistories.git', 'GIT_WORK_TREE': this._currentDir });
                this.isGitInitialized(this.codeHistoriesGit);
                break;
            case "case 2":
                // keep using codeHistories.git as default repo unless the user selects .git via the quick pick (presentGitRepos)
                console.log(".git folder does not exist");
                this.git = simpleGit(this._currentDir);
                this.isGitInitialized(this.git);
                this.codeHistoriesGit = simpleGit(this._currentDir).env({ 'GIT_DIR': this._currentDir + '/codeHistories.git', 'GIT_WORK_TREE': this._currentDir });
                this.isGitInitialized(this.codeHistoriesGit);
                break;
            case "case 3":
                console.log("codeHistories.git folder does not exist");
                this.git = simpleGit(this._currentDir);
                this.isGitInitialized(this.git);

                // run git log
                // if output is empty, create codeHistories.git and set it to be default repo
                // if output is not empty, copy .git to codeHistories.git
                this.git.log((err, log) => {
                    if(err) {
                        console.log(err);
                        // create codeHistories.git
                        this.codeHistoriesGit = simpleGit(this._currentDir).env({ 'GIT_DIR': this._currentDir + '/codeHistories.git' , 'GIT_WORK_TREE': this._currentDir });
                        this.isGitInitialized(this.codeHistoriesGit);
                    }
                    else {
                        if(log.total == 0) {
                            // create codeHistories.git
                            this.codeHistoriesGit = simpleGit(this._currentDir).env({ 'GIT_DIR': this._currentDir + '/codeHistories.git' , 'GIT_WORK_TREE': this._currentDir });
                            this.isGitInitialized(this.codeHistoriesGit);
                        }
                        else {
                            // retrieve hash of commits that have [Commit time:.*] in the commit message
                            var hashes = [];
                            for(var i = 0; i < log.total; i++) {
                                if(log.all[i].message.includes("[Commit time:")) {
                                    hashes.push(log.all[i].hash);
                                }
                            }

                            // create codeHistories.git
                            this.codeHistoriesGit = simpleGit(this._currentDir).env({ 'GIT_DIR': this._currentDir + '/codeHistories.git', 'GIT_WORK_TREE': this._currentDir });
                            this.isGitInitialized(this.codeHistoriesGit);

                            // copy .git to codeHistories.git
                            fs.cpSync(this._currentDir + '/.git', this._currentDir + '/codeHistories.git', {recursive: true});
                        }
                    }
                });
                break;
            case "case 4":
                console.log("both .git and codeHistories.git folders exist");
                this.git = simpleGit(this._currentDir);
                this.isGitInitialized(this.git);
                this.codeHistoriesGit = simpleGit(this._currentDir).env({ 'GIT_DIR': this._currentDir + '/codeHistories.git', 'GIT_WORK_TREE': this._currentDir });
                this.isGitInitialized(this.codeHistoriesGit);
                break;
        }
    }

    async gitAdd(){
        // add all files
        // this happens as soon as the user clicks on the checkAndCommit button
        // to avoid situation where user maybe changing files while committing (the commit will be based on the files at the time of clicking the button)
        if(this.isUsingCodeHistoriesGit) {
            let gitDir = path.join(this._currentDir, 'codeHistories.git');
            let workTree = path.join(this._currentDir);
            let addCmd = `git --git-dir="${gitDir}" --work-tree="${workTree}" add .`;
            try {
                await exec(addCmd, {cwd: workTree});
                console.log(`Added all files to codeHistories.git`);
            } catch (err) {
                console.log(`Error adding all files to codeHistories.git: ${err}`);
            }
        } else {
            try {
                await this.git.add('./*');
                console.log(`Added all files to .git`);
            } catch (err) {
                console.log(`Error adding all files to .git: ${err}`);
            }
        }
    }

    async gitReset(){
        // reset all files
        // this happens as soon as output.txt not updated
        if(this.isUsingCodeHistoriesGit) {
            let gitDir = path.join(this._currentDir, 'codeHistories.git');
            let workTree = path.join(this._currentDir);
            let resetCmd = `git --git-dir="${gitDir}" --work-tree="${workTree}" reset`;
            try {
                await exec(resetCmd, {cwd: workTree});
                console.log(`Successfully reset all files in codeHistories.git`);
            } catch (err) {
                console.log(`Error resetting all files in codeHistories.git: ${err}`);
            }
        } else {
            try {
                await this.git.reset(['./*']);
                console.log(`Successfully reset all files in .git`);
            } catch (err) {
                console.log(`Error resetting all files in .git: ${err}`);
            }
        }
    }

    async gitCommit() {
        // commit with time stamp
        var timeStamp = this.timestamp();
        var conversion = new Date(timeStamp).toLocaleString('en-US');
        var commitMessage = `[Commit time: ${conversion}]`;
        if(this.isUsingCodeHistoriesGit) {
            let gitDir = path.join(this._currentDir, 'codeHistories.git');
            let workTree = path.join(this._currentDir);
            let commitCmd = `git --git-dir="${gitDir}" --work-tree="${workTree}" commit -m "${commitMessage}"`;
            try {
                await exec(commitCmd, {cwd: workTree});
                console.log(`Committed to codeHistories.git`);
                
                const sleep = util.promisify(setTimeout);
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `COMMITTED!`,
                    cancellable: false
                }, async (progress, token) => {
                    progress.report({ increment: 0 });
                    await sleep(4000);
                });
            } catch (err) {
                console.error(`Commit error: ${err}`);
                vscode.window.showErrorMessage(`Commit failed! Please try again.`);
            }
        } else {
            try {
                await this.git.commit(commitMessage);
                console.log(`Committed to .git`);
            } catch (err) {
                console.log(`Commit error: ${err}`);
                vscode.window.showErrorMessage(`Commit failed! Please try again.`);
            }
        }
    }

    async checkWebData(){
        // check if web data is being tracked
        if(!fs.existsSync(this._currentDir + '/webData')){
            vscode.window.showInformationMessage('Web data does not exist! Make sure to also use webActivities.');
            return;
        }

        // set timeout to make sure that webData is most updated
        const sleep = util.promisify(setTimeout);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Committing! Hang tight!",
            cancellable: false
        }, async (progress, token) => {
            progress.report({ increment: 0 });
            await sleep(3000);
        });

        if(this.isUsingCodeHistoriesGit) {
            let gitDir = path.join(this._currentDir, 'codeHistories.git');
            let workTree = path.join(this._currentDir);
            let addWebDataCmd = `git --git-dir="${gitDir}" --work-tree="${workTree}" add -f webData`;
            try {
                await exec(addWebDataCmd, { cwd: workTree });
                console.log(`Added webData to codeHistories.git`);
            } catch (err) {
                console.error(`Error adding webData to codeHistories.git: ${err}`);
            }
        } else {
            try {
                await this.git.add('webData', ['-f']);
                console.log(`Added webData to .git`);
            } catch (err) {
                console.log(`Error adding webData to .git: ${err}`);
            }
        }
    }

    async undoCommit(){
        if(this.isUsingCodeHistoriesGit) {
            let gitDir = path.join(this._currentDir, 'codeHistories.git');
            let workTree = path.join(this._currentDir);
            let undoCmd = `git --git-dir="${gitDir}" --work-tree="${workTree}" reset HEAD~1`;
            try {
                await exec(undoCmd, { cwd: workTree });
                console.log(`Successfully undone commit for codeHistories.git`);
            } catch (err) {
                console.error(`Error undoing last commit for codeHistories.git: ${err}`);
            }
        } else {
            try {
                await this.git.reset(['HEAD~1']);
                console.log(`Successfully undone commit for .git`);
            } catch (err) {
                console.error(`Error undoing last commit for .git: ${err}`);
            }
        }

        const sleep = util.promisify(setTimeout);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Reverted to previous commit!`,
            cancellable: false
        }, async (progress, token) => {
            progress.report({ increment: 0 });
            await sleep(4000);
        });
    }

    async gitAddOutput(){
        if(this.isUsingCodeHistoriesGit) {
            let gitDir = path.join(this._currentDir, 'codeHistories.git');
            let workTree = path.join(this._currentDir);
            let addOutputCmd = `git --git-dir="${gitDir}" --work-tree="${workTree}" add -f output.txt`;
            try {
                await exec(addOutputCmd, { cwd: workTree });
                console.log(`Added output.txt to codeHistories.git`);
            } catch (err) {
                console.error(`Error adding output.txt to codeHistories.git: ${err}`);
            }
        } else {
            try {
                await this.git.add('output.txt', ['-f']);
                console.log(`Added output.txt to .git`);
            } catch (err) {
                console.error(`Error adding output.txt to .git: ${err}`);
            }
        }
    }

    async isOutputModified(){
        if(!fs.existsSync(this._currentDir + '/output.txt')){
            // create output.txt
            fs.writeFileSync(this._currentDir + '/output.txt', '', function (err) {
                if (err) {
                    console.log(err);
                    return false;
                }
            });
        }

        // check if output.txt is recently modified
        var outputFilePath = this._currentDir + '/output.txt';
        var stats = fs.statSync(outputFilePath);
        var mtime = new Date(util.inspect(stats.mtime));
        var now = new Date();
        var diff = now - mtime;
        var diffInMinutes = Math.floor(diff / 60000);
        if(diffInMinutes > 1){
            return false;
        }

        return true;
    }
}
