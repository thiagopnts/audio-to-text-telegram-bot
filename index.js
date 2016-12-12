const TelegramBot = require('node-telegram-bot-api');
const Speech = require('@google-cloud/speech');
const get = require('lodash.get');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || new Error('You should set TELEGRAM_BOT_TOKEN env variable');
const AUDIO_PATH = path.join(process.cwd(), './voice');

const allowEverything = process.env.DISALLOW_ALL ? false : true;
const nameRegExp = new RegExp(process.env.BOTNAME || 'speechtotextbot', 'i');
const textLang = process.env.TEXT_LANG || 'pt-BR';

const allowed = process.env.ALLOWED_IDS ? process.env.ALLOWED_IDS.split(',') : [];

const bot = new TelegramBot(TOKEN, {polling: true});
const speech = new Speech({});

let recognize = (file, config={encoding:'FLAC', sampleRate: 48000, languageCode: 'pt-BR'}) => {
  console.log('transcripting');
  return speech.startRecognition(file, config)
    .then(result => {
      const op = result[0];
      return op.promise();
    });
}

let transcode = file => {
  console.log('transcoding');
  const filename = path.basename(file);
  const nameWithoutExt = filename.replace(path.extname(filename), '');
  const output = path.join(AUDIO_PATH, `${nameWithoutExt}.flac`);
  return new Promise(resolve => {
    ffmpeg().input(file)
    .outputFormat('flac')
    .saveToFile(output)
    .on('end', () => resolve(output));
  })
};

let cleanup = file => {
  const fullFilenameWithoutExt = filename.replace(path.extname(filename), '');
  return new Promise((resolve, reject) => {
    s.unlink(`${fullFilenameWithoutExt}.oga`, err => err ? reject(err) : resolve());
  })
  .then(() => {
    s.unlink(`${fullFilenameWithoutExt}.flac`, err => err ? reject(err) : resolve());
  });
}

// TODO: clean up files after sending
bot.on('message', msg => {
  let isAllowed = allowEverything || (allowed.indexOf(get(msg, 'from.id', -1)) >= 0 || allowed.indexOf(get(msg, 'chat.id', -1)) >= 0);

  if (isAllowed && (msg.text || '').match(nameRegExp)) {
    const file = get(msg, 'reply_to_message.voice', null);
    file && bot.downloadFile(file.file_id, AUDIO_PATH)
    .then(transcode)
    .catch(err => {
      console.log('problem transcoding', err);
    })
    .then(recognize)
    .then(transcription => {
      let reply = transcription[0] ? '"' + transcription[0] + '"' : 'sorry I couldnt understand';
      console.log('reply', reply);
      bot.sendMessage(msg.chat.id, reply, {reply_to_message_id: msg.message_id});
    })
    .catch(err => {
      bot.sendMessage(msg.chat.id, 'sorry can you say it again', {reply_to_message_id: msg.message_id});
      console.log('problem with transcription', err);
    });
  } else {
    !isAllowed && bot.sendMessage(msg.chat.id, 'sorry I dont speak with strangers', {reply_to_message_id: msg.message_id});
  }
});



