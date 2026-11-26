using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

// Credentials belong to the current Windows user and never go into the distributed app.
internal sealed class Catalogs : IDisposable {
    internal static readonly string[] Names = { "SoundCloud", "YouTube", "Spotify" };
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength=32*1024*1024 };
    readonly string directory;
    readonly HttpClient http;
    readonly Dictionary<string,Token> tokens = new Dictionary<string,Token>();
    readonly Dictionary<string,SemaphoreSlim> gates = Names.ToDictionary(n=>n,n=>new SemaphoreSlim(1));
    class Token { public string Value, Refresh; public DateTime Expires; }
    public Catalogs(string profile) {
        directory = Path.Combine(profile, "Connections");
        http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false });
        http.Timeout = TimeSpan.FromSeconds(12);
        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
    }
    public bool Has(string name) { return Names.Contains(name) && File.Exists(Path.Combine(directory,name+".bin")); }
    public async Task Configure(string name,string id,string secret) {
        if (!Names.Contains(name)) throw new ArgumentException();
        var gate=gates[name]; await gate.WaitAsync();
        try {
            Directory.CreateDirectory(directory);
            string file=Path.Combine(directory,name+".bin");
            if (id.Length==0 && secret.Length==0) { File.Delete(file); tokens.Remove(name); return; }
            if (id.Length==0 || (name!="YouTube" && secret.Length==0)) throw new ArgumentException("Missing credentials");
            byte[] bytes=Encoding.UTF8.GetBytes(Json.Serialize(new[]{id,secret}));
            string staging=file+"."+Guid.NewGuid().ToString("N");
            try {
                File.WriteAllBytes(staging,ProtectedData.Protect(bytes,null,DataProtectionScope.CurrentUser));
                if(File.Exists(file))File.Replace(staging,file,null);else File.Move(staging,file);
                tokens.Remove(name);
            } finally { if(File.Exists(staging))File.Delete(staging); }
        } finally {gate.Release();}
    }
    static IDictionary<string,object> Obj(object value) {return value as IDictionary<string,object> ?? new Dictionary<string,object>();}
    internal static string Str(IDictionary<string,object> obj,string key) {object v;return obj.TryGetValue(key,out v)&&v!=null?v.ToString():"";}
    static object Get(object obj,string key) {object v;return Obj(obj).TryGetValue(key,out v)?v:null;}
    static IEnumerable<object> Items(object obj) {return (obj as IEnumerable<object>) ?? Enumerable.Empty<object>();}
    async Task<object> Send(HttpRequestMessage req) {
        using(req)using(var response=await http.SendAsync(req)){
            if(!response.IsSuccessStatusCode)throw new InvalidOperationException(((int)response.StatusCode).ToString());
            return Json.DeserializeObject(await response.Content.ReadAsStringAsync());
        }
    }
    async Task<Token> GetToken(string name,string[] keys) {
        Token prior;tokens.TryGetValue(name,out prior);
        if(prior!=null && prior.Expires>DateTime.UtcNow.AddSeconds(50))return prior;
        bool sc=name=="SoundCloud", refresh=sc && prior!=null && !String.IsNullOrEmpty(prior.Refresh);
        var req=new HttpRequestMessage(HttpMethod.Post,sc?"https://secure.soundcloud.com/oauth/token":"https://accounts.spotify.com/api/token");
        var fields=new Dictionary<string,string>();
        fields["grant_type"]=refresh?"refresh_token":"client_credentials";
        if(refresh){fields["refresh_token"]=prior.Refresh;fields["client_id"]=keys[0];fields["client_secret"]=keys[1];}
        else req.Headers.Authorization=new AuthenticationHeaderValue("Basic",Convert.ToBase64String(Encoding.UTF8.GetBytes(keys[0]+":"+keys[1])));
        req.Content=new FormUrlEncodedContent(fields);
        var obj=Obj(await Send(req));
        var token=new Token{Value=Str(obj,"access_token"),Refresh=Str(obj,"refresh_token"),Expires=DateTime.UtcNow.AddSeconds(Convert.ToDouble(Get(obj,"expires_in")??3600))};
        if(token.Value.Length==0)throw new InvalidOperationException("401");
        tokens[name]=token;return token;
    }
    internal static object[] Parse(string name,object payload){
        object rows=payload;
        if(name=="YouTube")rows=Get(payload,"items");
        if(name=="Spotify")rows=Get(Get(payload,"tracks"),"items");
        if(name=="SoundCloud" && Get(payload,"collection")!=null)rows=Get(payload,"collection");
        var list=new List<object>();
        foreach(var item in Items(rows)){
            var row=Obj(item);string title,artist,url;
            if(name=="YouTube"){
                var snippet=Obj(Get(row,"snippet"));title=WebUtility.HtmlDecode(Str(snippet,"title"));artist=WebUtility.HtmlDecode(Str(snippet,"channelTitle"));
                url="https://www.youtube.com/watch?v="+Uri.EscapeDataString(Str(Obj(Get(row,"id")),"videoId"));
            }else if(name=="Spotify"){
                title=Str(row,"name");artist=String.Join(", ",Items(Get(row,"artists")).Select(a=>Str(Obj(a),"name")));
                url=Str(Obj(Get(row,"external_urls")),"spotify");
            }else{title=Str(row,"title");artist=Str(Obj(Get(row,"user")),"username");url=Str(row,"permalink_url");}
            if(title.Length>0 && url.Length>0)list.Add(new { title,artist,url });
        }
        return list.ToArray();
    }
    public async Task<string> PublicData(string name,string query,string matches){
        string q=Uri.EscapeDataString(query),url,body=null;
        switch(name){
          case "Lyrics":
            if(matches.Length>240)throw new ArgumentException();
            url="https://lrclib.net/api/search?track_name="+q+"&artist_name="+Uri.EscapeDataString(matches);break;
          case "SoundCloud track":
            if(!System.Text.RegularExpressions.Regex.IsMatch(query,@"^https://soundcloud\.com/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+/?$"))throw new ArgumentException();
            url=query;break;
          case "SoundCloud":url="https://soundcloud.com/search/sounds?q="+q;break;
          case "YouTube":url="https://www.youtube.com/results?search_query="+q;break;
          case "Spotify":url="https://api.deezer.com/search?limit=10&q="+q;break;
          case "Spotify IDs":url="https://labs.api.listenbrainz.org/spotify-id-from-metadata/json";if(matches.Length>32000)throw new ArgumentException();body=matches;break;
          default:throw new ArgumentException();
        }
        string node=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"nodejs","node.exe");
        if(File.Exists(node)){
            var start=new ProcessStartInfo(node,"\""+Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"read-catalog.cjs")+"\""){
                CreateNoWindow=true,UseShellExecute=false,RedirectStandardInput=true,RedirectStandardOutput=true,StandardOutputEncoding=Encoding.UTF8
            };
            using(var process=Process.Start(start)){
                byte[] input=Encoding.UTF8.GetBytes(Json.Serialize(new {url,body}));
                await process.StandardInput.BaseStream.WriteAsync(input,0,input.Length);process.StandardInput.Close();
                string data=await process.StandardOutput.ReadToEndAsync();if(data.Length>0)return data;
            }
        }
        using(var req=new HttpRequestMessage(body==null?HttpMethod.Get:HttpMethod.Post,url)){
            if(body!=null)req.Content=new StringContent(body,Encoding.UTF8,"application/json");
            using(var response=await http.SendAsync(req)){response.EnsureSuccessStatusCode();return await response.Content.ReadAsStringAsync();}
        }
    }
    public async Task<string> SoundDownload(string id){
        const string name="SoundCloud";
        if(!Has(name)||!System.Text.RegularExpressions.Regex.IsMatch(id,@"^\d{1,20}$"))throw new ArgumentException();
        await gates[name].WaitAsync();
        try{
            var bytes=ProtectedData.Unprotect(File.ReadAllBytes(Path.Combine(directory,name+".bin")),null,DataProtectionScope.CurrentUser);
            var token=await GetToken(name,Json.Deserialize<string[]>(Encoding.UTF8.GetString(bytes)));
            using(var req=new HttpRequestMessage(HttpMethod.Get,"https://api.soundcloud.com/tracks/soundcloud:tracks:"+id+"/download")){
                req.Headers.Authorization=new AuthenticationHeaderValue("OAuth",token.Value);
                using(var response=await http.SendAsync(req,HttpCompletionOption.ResponseHeadersRead)){
                    string link=response.Headers.Location==null?"":response.Headers.Location.ToString();
                    if(link.Length==0&&response.IsSuccessStatusCode)
                        link=Str(Obj(Json.DeserializeObject(await response.Content.ReadAsStringAsync())),"redirectUri");
                    Uri uri;
                    if(!Uri.TryCreate(link,UriKind.Absolute,out uri)||uri.Scheme!="https")throw new InvalidOperationException();
                    return link;
                }
            }
        }finally{gates[name].Release();}
    }
    public async Task<object> Search(string name,string query){
        if(!Has(name))return new {name,status="public",rows=new object[0]};
        var gate=gates[name];await gate.WaitAsync();
        try {
            var bytes=ProtectedData.Unprotect(File.ReadAllBytes(Path.Combine(directory,name+".bin")),null,DataProtectionScope.CurrentUser);
            var keys=Json.Deserialize<string[]>(Encoding.UTF8.GetString(bytes));
            string q=Uri.EscapeDataString(query),url;
            if(name=="YouTube")url="https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=8&q="+q;
            else if(name=="Spotify")url="https://api.spotify.com/v1/search?type=track&market="+Region()+"&limit=8&q="+q;
            else url="https://api.soundcloud.com/tracks?limit=8&q="+q;
            var req=new HttpRequestMessage(HttpMethod.Get,url);
            if(name=="YouTube")req.Headers.Add("X-Goog-Api-Key",keys[0]);
            else {
                var token=await GetToken(name,keys);
                req.Headers.Authorization=new AuthenticationHeaderValue(name=="Spotify"?"Bearer":"OAuth",token.Value);
            }
            return new { name,status="ok",rows=Parse(name,await Send(req)) };
        }catch(Exception ex){
            string status="unavailable";
            if(ex.Message=="429"){status="limit";}
            if(ex.Message=="400"||ex.Message=="401"||ex.Message=="403"){tokens.Remove(name);status="access";}
            return new { name,status,rows=new object[0] };
        }finally{gate.Release();}
    }
    static string Region(){try{return System.Globalization.RegionInfo.CurrentRegion.TwoLetterISORegionName;}catch{return "US";}}
    public void Dispose(){http.Dispose();}
}
