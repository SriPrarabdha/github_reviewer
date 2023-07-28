import cheerios from "cheerio";
import { NextResponse } from "next/server";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAI } from "langchain/llms/openai";
import { RetrievalQAChain, loadQAStuffChain } from "langchain/chains";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import binaryExtensions from "binary-extensions/index";
import axios from "axios";
import {config} from "dotenv";
config();

const extensions = new Set(binaryExtensions);
const extname = (path:string) => `.${path.split(".").pop()}`;
function isBinaryPath(name:string) {
  return extensions.has(extname(name).slice(1).toLowerCase());
}

const not_good_ext = [".json" , ".yaml" , ".gitignore" , "LICENSE" , "yml" , ".yarn" , ".env" , ".watchmanconfig" , ".prettierrc" , ".prettierignore" , ".pdf" , ".ipynb" , ".txt"]

function check(name:string){
  for(let i = 0; i<not_good_ext.length ; i++){
    if(name.endsWith(not_good_ext[i])){
      return false;
    }
  }
    
  return true;
}
interface GithubFile {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string;
    type: string;
    _links: {
      self: string;
      git: string;
      html: string;
    };
  }

async function recurse(element:GithubFile, scraped_data:string) {
  if (element.type == "file" && !isBinaryPath(element.download_url) && check(element.name)) {
    const res = await fetch(element.download_url);
    const text = await res.text();
    scraped_data = scraped_data + text;
    // console.log("normal file data = " + scraped_data);
    return scraped_data;
  }
  if (element.type == "dir") {
    const url = element.url;
    const response = await fetch(url);
    const data = await response.json();
    for (let i = 0; i < data.length; i++) {
      scraped_data = await recurse(data[i], scraped_data);
    }
    return scraped_data;
  }
  if (element.name.endsWith(".ipynb")) {
    try{
    const res = await fetch(element.download_url);
    const text = await res.json();
    for (let i = 0; i < text.cells.length; i++) {
      for (let j = 0; j < text.cells[i].source.length; j++) {
        scraped_data = scraped_data + text.cells[i].source[j];
      }
      //console.log("ipynb file data = " + scraped_data);
    }
    return scraped_data;
  }catch{
    return scraped_data
  }

  } else {
    return scraped_data;
  }
}

async function scarpeData(element:GithubFile) {
  let scraped_data = "";
  scraped_data = await recurse(element, scraped_data);
  return scraped_data;
}

const analyze_repo = async(url:string , repo_name : string) =>{
  const accessToken = process.env.GITHUB_ACCESS_TOKEN

  const header = {
    Authorization: `Bearer ${accessToken}`,
  };

  const response = await fetch(url , {headers:header} );
  const data = await response.json();
  if(data.length <=5){
    return `Project = ${repo_name} is fairly simple as it contains less than total 4 files`;
  }

  let scraped_data_array = []
  for (let i = 0; i < data.length; i++) {
    const scrapeddata = await scarpeData(data[i]);
    scraped_data_array.push(scrapeddata);
  
  }

  let data_finally = `Project Name = '${repo_name}' `
  for (let i = 0 ; i<scraped_data_array.length ; i++){
    data_finally = data_finally + scraped_data_array[i]
  }

  console.log(data_finally+"--------------------------------------------------------------------------------------------------------");

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 300,
    chunkOverlap: 25,
  });

  const documents = await splitter.createDocuments([data_finally]);
  //console.log(documents[0].pageContent+"--------------------------------------------------------------------------------------------------------------");

  const embeddings = new OpenAIEmbeddings({
    openAIApiKey : process.env.OPENAI_API_KEY
  });

  const vectorStore = await MemoryVectorStore.fromDocuments(
    documents,
    embeddings
  );
  //console.log(vectorStore);

  const model = new OpenAI({ temperature: 0.3  , 
    openAIApiKey: process.env.OPENAI_API_KEY
});

  const chain = new RetrievalQAChain({
    combineDocumentsChain: loadQAStuffChain(model),
    retriever: vectorStore.asRetriever(),
    returnSourceDocuments: true,
    //verbose:true
  });

  const res = await chain.call({
    query: "You are a senior Developer and you are tasked with code review to determine if code is the difficult or complex. So First tell me what is the name of the project and then Give a very detailed report of this code what technologies are used, what is the difficulity  level and how complex the code is . Consider all aspects while commenting on difficulity level like number of  files , types of programming languages used . If you don't know the answe then atleast tell the name of project which is present at hte start of document and is there a lot of code written in it?",
  });

  return res.text;
}

export async function POST(
  req: Request
) {
  try {
    const body = await req.json();
    const { user_url  } = body;

    if (!user_url) {
      return new NextResponse("Messages are required", { status: 400 });
    }

    const user = user_url.replace("https://github.com/" , "")
    const repos_url = user_url+"?tab=repositories"
    let repo_url:string[] = []
        await axios.get(repos_url).then((response) => {
            const $ = cheerios.load(response.data);
            const lis = $("a[itemprop = 'name codeRepository']");
            lis.each((index, el) => { 
            
            repo_url.push($(el).attr('href')!)
            
            })
      });
      console.log(repo_url);
      

      let code_review = []

for (let i = 0 ; i<repo_url.length ; i++){
    //const url = "https://api.github.com/repos/SriPrarabdha/CLIP-TrademarkProtection/contents/?ref=main";
    const url = `https://api.github.com/repos${repo_url[i]}/contents/?ref=main`
    const response = await analyze_repo(url , repo_url[i].replace(user+"/" , ""))
    console.log(url,repo_url[i].replace(user+"/" , ""),response);
    code_review.push(response)
}

console.log(code_review);

    return NextResponse.json(code_review);
  } catch (error) {
    console.log('[CONVERSATION_ERROR]', error);
    return new NextResponse("Internal Error", { status: 500 });
  }
};
