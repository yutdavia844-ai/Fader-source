using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

sealed class FaderTrayMenu : ContextMenuStrip {
    readonly Font menuFont=new Font("Segoe UI",10);
    readonly Image power;
    static GraphicsPath Rounded(Rectangle r,int radius){
        var path=new GraphicsPath();int d=radius*2;
        path.AddArc(r.Left,r.Top,d,d,180,90);path.AddArc(r.Right-d,r.Top,d,d,270,90);
        path.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);path.AddArc(r.Left,r.Bottom-d,d,d,90,90);
        path.CloseFigure();return path;
    }
    public FaderTrayMenu(EventHandler open,EventHandler quit){
        Font=menuFont;Padding=new Padding(5);MinimumSize=new Size(166,0);ShowImageMargin=false;ShowCheckMargin=false;
        BackColor=Color.FromArgb(25,24,28);ForeColor=Color.WhiteSmoke;Renderer=new TrayRenderer();
        power=new Bitmap(22,22);
        using(var g=Graphics.FromImage(power))using(var pen=new Pen(Color.FromArgb(198,193,194),1.8f)){
            g.SmoothingMode=SmoothingMode.AntiAlias;pen.StartCap=pen.EndCap=LineCap.Round;
            g.DrawArc(pen,4,5,14,14,-54,288);g.DrawLine(pen,11,2,11,11);
        }
        Items.Add(Item("Open Fader",null,open));Items.Add(new ToolStripSeparator());
        Items.Add(Item("Quit Fader",power,quit));
    }
    ToolStripMenuItem Item(string label,Image glyph,EventHandler handler){
        var item=new ToolStripMenuItem(label,null,handler);
        item.Tag=glyph;item.Padding=new Padding(30,0,10,0);item.AutoSize=false;item.Size=new Size(164,36);
        return item;
    }
    protected override void OnOpened(EventArgs e){
        using(var path=Rounded(ClientRectangle,9)){var old=Region;Region=new Region(path);if(old!=null)old.Dispose();}
        base.OnOpened(e);
    }
    protected override void Dispose(bool disposing){
        base.Dispose(disposing);if(disposing){power.Dispose();menuFont.Dispose();}
    }
    sealed class TrayRenderer : ToolStripProfessionalRenderer {
        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e){
            var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
            var r=new Rectangle(0,1,e.Item.Width-1,e.Item.Height-2);
            if(e.Item.Selected)using(var path=Rounded(r,7))using(var brush=new SolidBrush(Color.FromArgb(55,46,47)))g.FillPath(brush,path);
            var image=e.Item.Tag as Image;
            if(image!=null)g.DrawImage(image,9,(e.Item.Height-18)/2,18,18);
            else using(var pen=new Pen(Color.FromArgb(255,131,86),2.4f)){
                pen.StartCap=pen.EndCap=LineCap.Round;int y=e.Item.Height/2;
                g.DrawLine(pen,10,y+4,12,y-2);g.DrawLine(pen,15,y+6,18,y-6);g.DrawLine(pen,21,y+4,23,y-4);
            }
        }
        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e){
            TextRenderer.DrawText(e.Graphics,e.Text,e.Item.Font,new Rectangle(35,0,e.Item.Width-39,e.Item.Height),e.Item.Selected?Color.White:Color.FromArgb(226,222,224),TextFormatFlags.VerticalCenter|TextFormatFlags.Left);
        }
        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e){e.Graphics.Clear(e.ToolStrip.BackColor);}
        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e){
            using(var path=Rounded(new Rectangle(0,0,e.ToolStrip.Width-1,e.ToolStrip.Height-1),9))
            using(var pen=new Pen(Color.FromArgb(67,61,65)))e.Graphics.DrawPath(pen,path);
        }
        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e){
            using(var pen=new Pen(Color.FromArgb(56,51,54)))e.Graphics.DrawLine(pen,9,e.Item.Height/2,e.Item.Width-9,e.Item.Height/2);
        }
    }
}
