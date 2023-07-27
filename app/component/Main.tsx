"use client"

import {useState , useEffect} from "react";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAI } from "langchain/llms/openai";
import { RetrievalQAChain, loadQAStuffChain } from "langchain/chains";

import axios from "axios";
import {config} from "dotenv";
config();


async function user_review(user_url:string){

const code_review = await axios.post('/api/scrape' , {user_url:user_url})


console.log(code_review);
let id=[]
for(let i = 0 ; i<code_review.data.length ; i++){
    id.push({
        id:i+1
    })
}

const vectorStore = await MemoryVectorStore.fromTexts(
    code_review.data,
    id,
    new OpenAIEmbeddings({openAIApiKey: process.env.OPENAI_API_KEY})
);

const model = new OpenAI({ temperature: 0.3 , openAIApiKey: process.env.OPENAI_API_KEY});

const chain = new RetrievalQAChain({
    combineDocumentsChain: loadQAStuffChain(model),
    retriever: vectorStore.asRetriever(),
    returnSourceDocuments: false,
});

const res = await chain.call({
    query: "You are a senior Developer and you are tasked with code review so that we can decide which project is the most difficult or complex one . You are given list of reviews of all the projects and you have to tell me which project is the most complex. Only answer the most complex project name and give a detailed answer why you think this project is the most complex one?",
});

return res.text;
}

const Main = () => {
    const [input, setInput] = useState("");
    const [response, setResponse] = useState("")

    const handleSubmit = async(event : React.FormEvent) => {
        event.preventDefault()
        const review = await user_review(input)

        setResponse(review);
        setInput("")
    }


  return (
    <div className="container mx-auto p-4 w-full sm:w-11/12 md:w-3/4 lg:w-2/3">
        <h1 className="text-2xl font-bold mb-4">Github User Reviewer</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
        <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full border border-gray-300 rounded"
            placeholder="Enter User's Github URL"
        />
         <button type="submit" className="w-full space-y-4 p-2 bg-blue-600 text-white font-semibold rounded">Submit</button>
        </form>
        {response && (
            <div className="mt-4 p-4 bg-gray-100 border border-gray-300 rounded">
                <p>{response}</p>
            </div>
        )}
       
    </div>
  )
}

export default Main