// YouTube Data APIを使うための設定.
const { google } = require('googleapis');
const privatekey = require("./privatekey.json");

let jwtClient = new google.auth.JWT(
    privatekey.client_email,
    null,
    privatekey.private_key,
    ['https://www.googleapis.com/auth/youtube']);

jwtClient.authorize((err, tokens) => {
    if (err) {
        console.log(err);
        return;
    }
    console.log('Google Oauth authorization succeeded');
});

let youtube = google.youtube({
    version: 'v3',
    auth: jwtClient,
});


// 材料からレシピを検索する. 
module.exports = (robot) => {
    let questionSentId = {};
    let searchWords = {};
    let addWords = {};
    let genre = {};

    // 文字をクエリパラメータから検索できるようにそれぞれの単語を"+"でつなぐ.Google, cookpadで検索するためにエンコードもする.
    function word(chatId) {
        let words;
        let uri;
        if (!(chatId in addWords)) {
            words = `${searchWords[chatId]}+${genre[chatId]}+レシピ`;
            uri = encodeURI(words);
        } else {
            let str = addWords[chatId];
            let newstr = str.replace(',', '+');
            words = `${searchWords[chatId]}+${newstr}+${genre[chatId]}+レシピ`
            uri = encodeURI(words);
        }
        return uri;
    };

    // 材料を受け付ける.
    robot.respond(/ing:\s*(.+)$/i, (res) => {
        const chatId = res.message.rooms[res.message.room].id;
        addWords[chatId] = undefined;
        searchWords[chatId] = res.match[1];
        res.send({
            text: `${searchWords[chatId]}を使った料理のレシピを検索します`,
            onsend: (sent) => {
                res.send({
                    // ジャンルを尋ねる. 
                    question: `${searchWords[chatId]}を使ったどのジャンルのレシピが知りたいですか？`,
                    options: ['ご飯もの', 'おかず', 'おつまみ', 'スイーツ'],
                    onsend: (sent) => {
                        questionSentId[chatId] = sent.message.id;
                    }
                });
            }
        });
    });
    // ジャンルの質問の回答結果
    robot.respond('select', (res) => {
        const chatId = res.message.rooms[res.message.room].id;
        genre[chatId] = res.json.options[res.json.response];
        if (res.json.response === null) {
            res.send(`Your question is ${res.json.question}.`);
        } else {
            res.send({
                close_select: questionSentId[res.message.rooms[res.message.room].id],
                onsend: (sent) => {
                    res.send({
                        text: `${searchWords[chatId]}を使った${genre[chatId]}のレシピですね.`,
                        onsend: (sent) => {
                            res.send({
                                text: `追加したい材料があれば\n\" add: \"の後に続けて送信してください.\n複数ある場合は\",\"区切りで教えてください.\nなければ\n\"cmd: YouTube\"と送信してください.\n※googleとcookpad検索は追加食材がある場合のみ利用できます。`,
                            })
                        }
                    });
                }
            });
        }
    });
    // 追加の材料がある場合, addの時
    robot.respond(/add:\s*(.+)$/i, (res) => {
        const chatId = res.message.rooms[res.message.room].id;
        //
        addWords[chatId] = undefined;
        // searchWordが未定義の時はメッセージを送る.
        if (!searchWords[chatId]) {
            res.send({
                text: '検索したい材料を先に入力してください。'
            })
        } else if (!genre[chatId]) {
            res.send({
                text: 'ジャンルを先に選択してください。'
            })
        } else {
            addWords[chatId] = res.match[1];
            res.send({
                text:
                    `${searchWords[chatId]},${addWords[chatId]}を使った${genre[chatId]}のレシピを検索します.\n検索方法を\nYouTube, Google, cookpadから選んで、\n\"cmd: \"に続けて教えてください.`,
            });
        }
    });

    // cmd:で検索方法を尋ねる. 
    robot.respond(/cmd:\s*(.+)$/i, (res) => {
        const chatId = res.message.rooms[res.message.room].id;
        if (res.match[1].toLowerCase() == "youtube") {
            words = `${searchWords[chatId]}+${genre[chatId]}+レシピ`;
            res.send({
                text: `YouTubeで検索します.`,
                onsend: (sent) => {
                    youtube.search.list({
                        part: 'snippet',
                        q: words,
                        maxResults: 2,
                    }, (err, data) => {
                        if (err) {
                            console.log(err)
                        }
                        else {
                            let urlStr = words + '\n';
                            for (let i in data.data.items) {
                                urlStr += 'https://youtube.com/watch?v=' + data.data.items[i].id.videoId + '\n';
                            }
                            res.send({
                                text: urlStr
                            });
                        }
                    });
                }
            });
        } else if (res.match[1].toLowerCase() == "google") {
            let resultWord = word(chatId);
            res.send({
                text: `Googleで検索します.`,
                onsend: (sent) => {
                    res.send({
                        text: `https://www.google.com/search?q=${resultWord}`
                    });
                }
            });
        } else if (res.match[1].toLowerCase() == "cookpad") {
            let resultWord = word(chatId);
            res.send({
                text: `cookpadで検索します.`,
                onsend: (sent) => {
                    res.send({
                        text: `https://cookpad.com/search/${resultWord}`
                    });
                }
            });
        }
    });
};